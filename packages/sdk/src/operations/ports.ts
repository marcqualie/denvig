import { networkInterfaces } from 'node:os'

import { DenvigOperationError, DenvigValidationError } from '../lib/errors.ts'
import serviceBackend, {
  type ServiceListItem,
} from '../lib/services/backend.ts'
import { activeForegroundRun } from '../lib/services/foreground.ts'
import { isGlobalSlug } from '../lib/services/global.ts'
import { normalizeServiceLabel } from '../lib/services/paths.ts'
import { type DenvigState, readState } from '../lib/services/state.ts'
import {
  type AddressFamily,
  classifyAddress,
  type PortScope,
  type ProcessEntry,
  processAncestry,
  type RawListener,
  readProcessTable,
  readTcpListeners,
  resolveInterfaceName,
  widestScope,
} from '../lib/system/ports.ts'

export type { AddressFamily, PortScope } from '../lib/system/ports.ts'

/**
 * One address a port is bound to.
 */
export type PortBinding = {
  /**
   * The bound address (`*` for every interface).
   */
  address: string
  family: AddressFamily
  scope: PortScope
  /**
   * Interface name (eg. `lo0`, `en0`), or null for wildcard bindings.
   */
  interface: string | null
}

/**
 * The process holding a listening port.
 */
export type PortProcess = {
  pid: number
  name: string
  /**
   * Full command line, when it could be read from the process table.
   */
  command: string | null
  user: string | null
  ppid: number | null
}

/**
 * A denvig service related to a port.
 */
export type PortServiceRef = {
  projectId: string
  projectSlug: string | null
  serviceName: string
  /**
   * Identifier accepted by `denvig services` commands.
   */
  identifier: string
  status: 'running' | 'stopped'
}

/**
 * How a listening port was attributed to a denvig service.
 *
 * - `process`: the listener runs inside the service's process tree
 * - `config`: the service is configured for this port (eg. a docker port
 *   published by the container runtime)
 */
export type PortServiceLink = PortServiceRef & {
  via: 'process' | 'config'
}

/**
 * A TCP port being listened on by a process.
 */
export type SystemPort = {
  port: number
  protocol: 'tcp'
  /**
   * Every address the process listens on for this port.
   */
  bindings: PortBinding[]
  /**
   * The widest scope across all bindings.
   */
  scope: PortScope
  /**
   * The process holding the port, or null when the OS hides it (eg. it
   * belongs to another user).
   */
  process: PortProcess | null
  /**
   * Every pid sharing the socket (eg. pre-forked workers).
   */
  pids: number[]
  /**
   * The denvig service that owns the listener, if any.
   */
  service: PortServiceLink | null
  /**
   * Denvig services configured for this port that do not own the listener.
   */
  conflicts: PortServiceRef[]
}

export type PortInfo = {
  port: number
  inUse: boolean
  listeners: SystemPort[]
  /**
   * Every denvig service configured for this port, whether running or not.
   */
  services: PortServiceRef[]
}

export type ListPortsOptions = {
  /**
   * Only include ports linked to a denvig service, either as owner or
   * conflict.
   */
  denvig?: boolean
}

export type KillPortOptions = {
  /**
   * Signal to send.
   * @default 'SIGTERM'
   */
  signal?: NodeJS.Signals
  /**
   * Kill the process even when it belongs to a running denvig service.
   */
  force?: boolean
  /**
   * How long to wait for the port to be released.
   * @default 5000
   */
  timeoutMs?: number
}

export type KillPortResult = {
  port: number
  signal: NodeJS.Signals
  killed: PortProcess[]
  failed: { pid: number; message: string }[]
  /**
   * Whether the port stopped being listened on before the timeout.
   */
  released: boolean
}

/**
 * A denvig service known from state or the OS service manager, with the
 * ports it is configured for and the pids that root its process tree.
 */
export type ServiceCandidate = PortServiceRef & {
  runtime: 'host' | 'docker'
  ports: number[]
  pids: number[]
}

/**
 * Process names of container runtimes that publish ports on behalf of
 * containers (Docker Desktop, OrbStack, Colima/Lima, Podman).
 */
const CONTAINER_RUNTIME_PATTERN =
  /docker|vpnkit|orbstack|limactl|gvproxy|rootlessport|podman|colima/i

/**
 * Host port of a docker port mapping (`[ip:]host:container[/proto]`).
 */
export const dockerHostPort = (mapping: string): number | null => {
  const parts = mapping.split('/')[0].split(':')
  if (parts.length < 2) return null
  const port = Number(parts[parts.length - 2])
  return Number.isInteger(port) && port > 0 ? port : null
}

const serviceIdentifier = (
  projectId: string,
  projectSlug: string | null,
  serviceName: string,
): string => {
  if (projectSlug && isGlobalSlug(projectSlug)) return `global:${serviceName}`
  if (projectSlug) return `${projectSlug}/${serviceName}`
  return `id:${projectId}/${serviceName}`
}

/**
 * Build the list of denvig services from recorded state and the services
 * currently loaded in the OS service manager.
 */
export const buildServiceCandidates = (
  state: DenvigState,
  loaded: ServiceListItem[],
): ServiceCandidate[] => {
  const pidByLabel = new Map<string, number>()
  for (const item of loaded) {
    if (typeof item.pid === 'number') pidByLabel.set(item.label, item.pid)
  }

  const candidates: ServiceCandidate[] = []
  const seenLabels = new Set<string>()

  for (const [key, entry] of Object.entries(state.services)) {
    const match = key.match(/^id:([^:]+):(.+)$/)
    const projectId = entry.project?.id ?? match?.[1]
    const serviceName = entry.serviceName ?? match?.[2]
    if (!projectId || !serviceName) continue

    const label = `denvig.${projectId}.${normalizeServiceLabel(serviceName)}`
    seenLabels.add(label)

    const pids: number[] = []
    const managerPid = pidByLabel.get(label)
    if (managerPid) pids.push(managerPid)
    const foreground = activeForegroundRun(entry)
    if (foreground) pids.push(foreground.pid)

    const runtime = entry.config?.runtime === 'docker' ? 'docker' : 'host'
    const ports = new Set<number>()
    if (entry.port) ports.add(entry.port)
    if (entry.config?.http?.port) ports.add(entry.config.http.port)
    for (const mapping of entry.config?.container?.ports ?? []) {
      const hostPort = dockerHostPort(mapping)
      if (hostPort) ports.add(hostPort)
    }

    const projectSlug = entry.project?.slug ?? null
    const running =
      pids.length > 0 ||
      (runtime === 'docker' && entry.desiredStatus === 'running')
    candidates.push({
      projectId,
      projectSlug,
      serviceName,
      identifier: serviceIdentifier(projectId, projectSlug, serviceName),
      status: running ? 'running' : 'stopped',
      runtime,
      ports: [...ports],
      pids,
    })
  }

  // Services loaded in the service manager but missing from state (eg. from
  // an older denvig) can still be matched by process tree.
  for (const [label, pid] of pidByLabel) {
    if (seenLabels.has(label)) continue
    const match = label.match(/^denvig\.([0-9a-f]+)\.(.+)$/)
    if (!match) continue
    const [, projectId, serviceName] = match
    candidates.push({
      projectId,
      projectSlug: null,
      serviceName,
      identifier: serviceIdentifier(projectId, null, serviceName),
      status: 'running',
      runtime: 'host',
      ports: [],
      pids: [pid],
    })
  }

  return candidates
}

const toRef = (candidate: ServiceCandidate): PortServiceRef => ({
  projectId: candidate.projectId,
  projectSlug: candidate.projectSlug,
  serviceName: candidate.serviceName,
  identifier: candidate.identifier,
  status: candidate.status,
})

/**
 * Combine raw listeners, the process table and known denvig services into
 * one entry per port and owning process.
 */
export const resolvePorts = (
  listeners: RawListener[],
  processes: Map<number, ProcessEntry>,
  candidates: ServiceCandidate[],
  interfaces: ReturnType<typeof networkInterfaces> = networkInterfaces(),
): SystemPort[] => {
  type Group = { port: number; pid: number | null; items: RawListener[] }
  const groups = new Map<string, Group>()
  for (const listener of listeners) {
    const key = `${listener.port}:${listener.pid ?? '?'}`
    const group = groups.get(key)
    if (group) group.items.push(listener)
    else
      groups.set(key, {
        port: listener.port,
        pid: listener.pid,
        items: [listener],
      })
  }

  // Collapse pre-forked children into the ancestor that shares the socket.
  const pidsByPort = new Map<number, Set<number>>()
  for (const group of groups.values()) {
    if (group.pid === null) continue
    const set = pidsByPort.get(group.port) ?? new Set<number>()
    set.add(group.pid)
    pidsByPort.set(group.port, set)
  }
  const merged = new Map<string, Group & { pids: number[] }>()
  for (const [key, group] of groups) {
    let rootPid = group.pid
    if (group.pid !== null) {
      const samePort = pidsByPort.get(group.port) ?? new Set()
      for (const ancestor of processAncestry(group.pid, processes)) {
        if (samePort.has(ancestor)) rootPid = ancestor
      }
    }
    const rootKey = rootPid === null ? key : `${group.port}:${rootPid}`
    const existing = merged.get(rootKey)
    if (existing) {
      existing.items.push(...group.items)
      if (group.pid !== null && !existing.pids.includes(group.pid)) {
        existing.pids.push(group.pid)
      }
    } else {
      merged.set(rootKey, {
        port: group.port,
        pid: rootPid,
        items: [...group.items],
        pids: group.pid === null ? [] : [group.pid],
      })
    }
  }

  const ownerByPid = new Map<number, ServiceCandidate>()
  for (const candidate of candidates) {
    for (const pid of candidate.pids) ownerByPid.set(pid, candidate)
  }

  const results: SystemPort[] = []
  for (const group of merged.values()) {
    const bindingKeys = new Set<string>()
    const bindings: PortBinding[] = []
    for (const item of group.items) {
      const key = `${item.family}:${item.address}`
      if (bindingKeys.has(key)) continue
      bindingKeys.add(key)
      bindings.push({
        address: item.address,
        family: item.family,
        scope: classifyAddress(item.address),
        interface: resolveInterfaceName(item.address, interfaces),
      })
    }
    bindings.sort((a, b) => a.family.localeCompare(b.family))

    const entry = group.pid === null ? undefined : processes.get(group.pid)
    const first = group.items.find((i) => i.pid === group.pid) ?? group.items[0]
    const proc: PortProcess | null =
      group.pid === null
        ? null
        : {
            pid: group.pid,
            name:
              first.name ?? entry?.command.split(/\s+/)[0] ?? String(group.pid),
            command: entry?.command ?? null,
            user: first.user ?? entry?.user ?? null,
            ppid: entry?.ppid ?? null,
          }

    let owner: ServiceCandidate | null = null
    if (group.pid !== null) {
      for (const pid of processAncestry(group.pid, processes)) {
        const candidate = ownerByPid.get(pid)
        if (candidate) {
          owner = candidate
          break
        }
      }
    }

    const claimants = candidates.filter((c) => c.ports.includes(group.port))
    let service: PortServiceLink | null = owner
      ? { ...toRef(owner), via: 'process' }
      : null
    if (!service) {
      // Container runtimes publish ports from their own process, so a running
      // docker service configured for the port owns a runtime-held listener.
      const runtimeHeld =
        proc === null || CONTAINER_RUNTIME_PATTERN.test(proc.name)
      const configured = runtimeHeld
        ? claimants.find(
            (c) =>
              c.status === 'running' &&
              (c.runtime === 'docker' || proc === null),
          )
        : undefined
      if (configured) service = { ...toRef(configured), via: 'config' }
    }
    const conflicts = claimants
      .filter(
        (c) =>
          !service ||
          c.projectId !== service.projectId ||
          c.serviceName !== service.serviceName,
      )
      .map(toRef)

    results.push({
      port: group.port,
      protocol: 'tcp',
      bindings,
      scope: widestScope(bindings.map((b) => b.scope)),
      process: proc,
      pids: group.pids.sort((a, b) => a - b),
      service,
      conflicts,
    })
  }

  return results.sort(
    (a, b) => a.port - b.port || (a.process?.pid ?? 0) - (b.process?.pid ?? 0),
  )
}

const loadPortContext = async () => {
  const [listeners, processes, state, loaded] = await Promise.all([
    readTcpListeners(),
    readProcessTable(),
    readState(),
    serviceBackend.list('denvig.'),
  ])
  const candidates = buildServiceCandidates(state, loaded)
  return { listeners, processes, candidates }
}

/**
 * List every TCP port being listened on, linked to denvig services where
 * possible. Shared by `denvig system ports` and `sdk.ports.list()`.
 */
export const listPorts = async (
  options: ListPortsOptions = {},
): Promise<SystemPort[]> => {
  const { listeners, processes, candidates } = await loadPortContext()
  const ports = resolvePorts(listeners, processes, candidates)
  if (!options.denvig) return ports
  return ports.filter((p) => p.service || p.conflicts.length > 0)
}

const validatePort = (port: number): number => {
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new DenvigValidationError(
      `Invalid port${Number.isNaN(port) ? '' : ` "${port}"`}. Must be an integer between 1 and 65535.`,
    )
  }
  return port
}

/**
 * Describe a single port: the processes listening on it and any denvig
 * services configured for it.
 */
export const retrievePort = async (port: number): Promise<PortInfo> => {
  validatePort(port)
  const { listeners, processes, candidates } = await loadPortContext()
  const matching = listeners.filter((l) => l.port === port)
  const resolved = resolvePorts(matching, processes, candidates)
  return {
    port,
    inUse: resolved.length > 0,
    listeners: resolved,
    services: candidates.filter((c) => c.ports.includes(port)).map(toRef),
  }
}

/**
 * Throw when a port cannot or should not be killed: nothing listens on it,
 * the owner is hidden, or it belongs to a running denvig service and `force`
 * was not given.
 */
export const assertKillable = (info: PortInfo, force: boolean): void => {
  const { port } = info
  if (!info.inUse) {
    throw new DenvigValidationError(`Nothing is listening on port ${port}.`)
  }
  if (info.listeners.every((l) => l.process === null)) {
    throw new DenvigOperationError(
      `Port ${port} is in use but the owning process is not visible. It may belong to another user.`,
    )
  }
  if (force) return
  const owned = info.listeners.find((l) => l.service?.via === 'process')
  if (owned?.service) {
    throw new DenvigValidationError(
      `Port ${port} belongs to denvig service ${owned.service.identifier}. Stop it with \`denvig services stop ${owned.service.identifier}\` or use force to kill the process anyway.`,
    )
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Send a signal to every process listening on a port and wait for it to be
 * released. Refuses to touch processes owned by a running denvig service
 * unless `force` is set, since the service manager may restart them.
 */
export const killPort = async (
  port: number,
  options: KillPortOptions = {},
): Promise<KillPortResult> => {
  const signal = options.signal ?? 'SIGTERM'
  const timeoutMs = options.timeoutMs ?? 5000
  const info = await retrievePort(port)
  assertKillable(info, options.force ?? false)

  const killed: PortProcess[] = []
  const failed: KillPortResult['failed'] = []
  const pids = new Set<number>()
  for (const listener of info.listeners) {
    if (!listener.process) continue
    for (const pid of listener.pids) {
      if (pids.has(pid)) continue
      pids.add(pid)
      try {
        process.kill(pid, signal)
        if (pid === listener.process.pid) killed.push(listener.process)
      } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        // A worker may have exited together with its parent.
        if (code === 'ESRCH') continue
        failed.push({
          pid,
          message: error instanceof Error ? error.message : String(error),
        })
      }
    }
  }

  let released = false
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const remaining = (await readTcpListeners()).filter(
      (l) => l.port === port && l.pid !== null && pids.has(l.pid),
    )
    if (remaining.length === 0) {
      released = true
      break
    }
    await sleep(100)
  }

  return { port, signal, killed, failed, released }
}
