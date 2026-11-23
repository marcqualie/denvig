import { networkInterfaces } from 'node:os'

import { execCommand } from './process.ts'

/**
 * How widely a listening socket is reachable.
 *
 * - `loopback`: only this machine (eg. `127.0.0.1`, `::1`)
 * - `network`: a specific non-loopback interface (eg. a LAN or VPN address)
 * - `all`: every interface (`*`, `0.0.0.0`, `::`)
 */
export type PortScope = 'loopback' | 'network' | 'all'

export type AddressFamily = 'IPv4' | 'IPv6'

/**
 * A single TCP listening socket as reported by the OS.
 */
export type RawListener = {
  port: number
  address: string
  family: AddressFamily
  /**
   * Owning process, when the OS exposes it (sockets owned by other users are
   * usually hidden without elevated privileges).
   */
  pid: number | null
  /**
   * Short process name as reported alongside the socket.
   */
  name: string | null
  user: string | null
}

/**
 * A row from the process table.
 */
export type ProcessEntry = {
  pid: number
  ppid: number
  user: string
  command: string
}

const WILDCARD_ADDRESSES = new Set(['*', '0.0.0.0', '::', '::0'])

/**
 * Split `host:port` (with optional IPv6 brackets) into its parts.
 */
export const splitHostPort = (
  value: string,
): { address: string; port: number } | null => {
  const index = value.lastIndexOf(':')
  if (index === -1) return null
  const port = Number.parseInt(value.slice(index + 1), 10)
  if (!Number.isInteger(port) || port <= 0) return null
  let address = value.slice(0, index)
  if (address.startsWith('[') && address.endsWith(']')) {
    address = address.slice(1, -1)
  }
  return { address, port }
}

const inferFamily = (address: string): AddressFamily =>
  address.includes(':') ? 'IPv6' : 'IPv4'

/**
 * Classify a bound address by how widely it is reachable.
 */
export const classifyAddress = (address: string): PortScope => {
  const bare = address.split('%')[0].toLowerCase()
  if (WILDCARD_ADDRESSES.has(bare)) return 'all'
  const v4 = bare.startsWith('::ffff:') ? bare.slice('::ffff:'.length) : bare
  if (v4.startsWith('127.') || bare === '::1' || bare === 'localhost') {
    return 'loopback'
  }
  return 'network'
}

/**
 * Pick the widest scope from a set of bindings.
 */
export const widestScope = (scopes: PortScope[]): PortScope => {
  if (scopes.includes('all')) return 'all'
  if (scopes.includes('network')) return 'network'
  return 'loopback'
}

/**
 * Resolve the network interface name a bound address belongs to. Returns null
 * for wildcard bindings (they cover every interface) or unknown addresses.
 */
export const resolveInterfaceName = (
  address: string,
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): string | null => {
  if (classifyAddress(address) === 'all') return null
  const [bare, zone] = address.split('%')
  if (zone) return zone
  const needle = bare.toLowerCase().replace(/^::ffff:/, '')
  for (const [name, entries] of Object.entries(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.address.toLowerCase().split('%')[0] === needle) return name
    }
  }
  return null
}

/**
 * Parse `lsof -nP -iTCP -sTCP:LISTEN -FpcLtn` field output.
 */
export const parseLsofListeners = (output: string): RawListener[] => {
  const listeners: RawListener[] = []
  let pid: number | null = null
  let name: string | null = null
  let user: string | null = null
  let family: AddressFamily | null = null

  for (const line of output.split('\n')) {
    if (line.length === 0) continue
    const field = line[0]
    const value = line.slice(1)
    switch (field) {
      case 'p':
        pid = Number.parseInt(value, 10)
        name = null
        user = null
        family = null
        break
      case 'c':
        name = value
        break
      case 'L':
        user = value
        break
      case 'f':
        family = null
        break
      case 't':
        family = value === 'IPv6' ? 'IPv6' : value === 'IPv4' ? 'IPv4' : null
        break
      case 'n': {
        const parsed = splitHostPort(value)
        if (!parsed) break
        listeners.push({
          ...parsed,
          // lsof reports the socket type, which can be IPv6 for a dual-stack
          // socket bound to an IPv4 address. Trust the address when explicit.
          family:
            parsed.address === '*'
              ? (family ?? 'IPv4')
              : inferFamily(parsed.address),
          pid,
          name,
          user,
        })
        break
      }
    }
  }
  return listeners
}

/**
 * Parse `ss -Hltnp` output (Linux).
 */
export const parseSsListeners = (output: string): RawListener[] => {
  const listeners: RawListener[] = []
  for (const line of output.split('\n')) {
    const columns = line.trim().split(/\s+/)
    if (columns.length < 4) continue
    // State Recv-Q Send-Q Local Peer [Process]
    const local = columns[3]
    const parsed = splitHostPort(local)
    if (!parsed) continue
    const processInfo = columns.slice(5).join(' ')
    const owners = [...processInfo.matchAll(/\("([^"]*)",pid=(\d+)/g)]
    const base = { ...parsed, family: inferFamily(parsed.address) }
    if (owners.length === 0) {
      listeners.push({ ...base, pid: null, name: null, user: null })
      continue
    }
    for (const [, name, pid] of owners) {
      listeners.push({
        ...base,
        pid: Number.parseInt(pid, 10),
        name,
        user: null,
      })
    }
  }
  return listeners
}

/**
 * Parse `ps -axo pid=,ppid=,user=,args=` output.
 */
export const parseProcessTable = (
  output: string,
): Map<number, ProcessEntry> => {
  const processes = new Map<number, ProcessEntry>()
  for (const line of output.split('\n')) {
    const match = line.trim().match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/)
    if (!match) continue
    const pid = Number.parseInt(match[1], 10)
    processes.set(pid, {
      pid,
      ppid: Number.parseInt(match[2], 10),
      user: match[3],
      command: match[4],
    })
  }
  return processes
}

/**
 * Walk up the process tree from `pid`, returning the pid itself followed by
 * every ancestor. Guards against cycles and stops at the root.
 */
export const processAncestry = (
  pid: number,
  processes: Map<number, ProcessEntry>,
): number[] => {
  const chain: number[] = []
  const seen = new Set<number>()
  let current: number | undefined = pid
  while (current !== undefined && current > 0 && !seen.has(current)) {
    chain.push(current)
    seen.add(current)
    current = processes.get(current)?.ppid
  }
  return chain
}

const stdoutOf = async (command: string, args: string[]): Promise<string> => {
  try {
    const { stdout } = await execCommand(command, args, {
      timeout: 10_000,
    })
    return stdout
  } catch (error) {
    // lsof exits 1 when nothing matches but still prints what it found.
    const stdout = (error as { stdout?: unknown }).stdout
    if (typeof stdout === 'string' && stdout.length > 0) return stdout
    throw error
  }
}

/**
 * Read every TCP listening socket visible to the current user. Uses `ss` on
 * Linux when available and `lsof` everywhere else.
 */
export const readTcpListeners = async (
  platform: NodeJS.Platform = process.platform,
): Promise<RawListener[]> => {
  if (platform === 'linux') {
    try {
      return parseSsListeners(await stdoutOf('ss', ['-Hltnp']))
    } catch {
      // Fall back to lsof below.
    }
  }
  try {
    return parseLsofListeners(
      await stdoutOf('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN', '-FpcLtn']),
    )
  } catch {
    return []
  }
}

/**
 * Read the full process table.
 */
export const readProcessTable = async (): Promise<
  Map<number, ProcessEntry>
> => {
  try {
    return parseProcessTable(
      await stdoutOf('ps', ['-axo', 'pid=,ppid=,user=,args=']),
    )
  } catch {
    return new Map()
  }
}
