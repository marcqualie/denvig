import { createServer } from 'node:net'

import { readState, reservedPorts } from './state.ts'

/** Inclusive default port range used for random allocations. */
export const DEFAULT_PORT_RANGE: PortRange = { min: 8000, max: 9999 }

export type PortRange = {
  min: number
  max: number
}

/**
 * Check whether a TCP port is currently bound by any other process. Returns
 * true when the port is unavailable.
 *
 * Listens without an explicit address so the probe binds across IPv4 and
 * IPv6 — necessary on macOS where IPv6 sockets are not always dual-stack
 * and a `127.0.0.1`-only probe would miss processes listening on `::`.
 */
export const isPortInUse = (port: number): Promise<boolean> => {
  return new Promise((resolve) => {
    const server = createServer()
    server.unref()
    server.once('error', (err: NodeJS.ErrnoException) => {
      resolve(err.code === 'EADDRINUSE')
    })
    server.once('listening', () => {
      server.close(() => resolve(false))
    })
    server.listen(port)
  })
}

/**
 * Allocate a port that is not reserved by another running service and is not
 * currently bound on the host. Prefers `preferredPort` when available.
 *
 * Returns null if no port in the range can be allocated after a reasonable
 * number of attempts.
 */
export const allocateRandomPort = async (options?: {
  preferredPort?: number
  range?: PortRange
  excludePorts?: Iterable<number>
}): Promise<number | null> => {
  const range = options?.range ?? DEFAULT_PORT_RANGE
  const state = await readState()
  const exclude = new Set<number>([
    ...reservedPorts(state),
    ...(options?.excludePorts ?? []),
  ])

  const tryPort = async (port: number): Promise<boolean> => {
    if (exclude.has(port)) return false
    return !(await isPortInUse(port))
  }

  if (options?.preferredPort && (await tryPort(options.preferredPort))) {
    return options.preferredPort
  }

  const span = range.max - range.min + 1
  const maxAttempts = Math.min(span, 200)
  for (let i = 0; i < maxAttempts; i++) {
    const port = range.min + Math.floor(Math.random() * span)
    if (await tryPort(port)) return port
    exclude.add(port)
  }
  return null
}
