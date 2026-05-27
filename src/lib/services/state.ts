import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

export const ServiceStateEntrySchema = z.object({
  cwd: z.string(),
  port: z.number().int().positive().optional(),
  domains: z.array(z.string()).default([]),
  desiredStatus: z.enum(['running', 'stopped']).default('running'),
})

/**
 * One mapping in the gateway routing table. `defaultService` records
 * whether the route was registered as the natural owner of the domain
 * (`true`, the first claim) or a worktree override (`false`, claimed via
 * the conflict prompt).
 */
export const GatewayRouteSchema = z.object({
  project: z.string(),
  service: z.string(),
  port: z.number().int().positive(),
  defaultService: z.boolean().default(true),
  secure: z.boolean().default(false),
  desiredStatus: z.enum(['running', 'stopped']).default('running'),
})

export const DenvigStateSchema = z.object({
  services: z.record(z.string(), ServiceStateEntrySchema).default({}),
  gatewayRoutes: z.record(z.string(), GatewayRouteSchema).default({}),
})

export type ServiceStateEntry = z.infer<typeof ServiceStateEntrySchema>
export type GatewayRoute = z.infer<typeof GatewayRouteSchema>
export type DenvigState = z.infer<typeof DenvigStateSchema>

const stateFilePath = (): string => resolve(homedir(), '.denvig', 'state.json')

const emptyState = (): DenvigState => ({ services: {}, gatewayRoutes: {} })

/** Stable key used to address a service in the state file. */
export const serviceStateKey = (
  projectId: string,
  serviceName: string,
): string => `id:${projectId}:${serviceName}`

/** Read the state file. Returns an empty state when missing or unparseable. */
export const readState = async (): Promise<DenvigState> => {
  try {
    const content = await readFile(stateFilePath(), 'utf-8')
    const parsed = DenvigStateSchema.safeParse(JSON.parse(content))
    if (!parsed.success) return emptyState()
    return parsed.data
  } catch {
    return emptyState()
  }
}

/** Atomically write the state file. */
export const writeState = async (state: DenvigState): Promise<void> => {
  const path = stateFilePath()
  await mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${process.pid}.tmp`
  await writeFile(tmp, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
  await rename(tmp, path)
}

/** Get the state entry for a single service, or null when missing. */
export const getServiceState = async (
  projectId: string,
  serviceName: string,
): Promise<ServiceStateEntry | null> => {
  const state = await readState()
  return state.services[serviceStateKey(projectId, serviceName)] ?? null
}

/** Merge new fields into a service's state entry. Creates the entry if missing. */
export const updateServiceState = async (
  projectId: string,
  serviceName: string,
  entry: Partial<ServiceStateEntry> & Pick<ServiceStateEntry, 'cwd'>,
): Promise<void> => {
  const state = await readState()
  const key = serviceStateKey(projectId, serviceName)
  const existing = state.services[key]
  state.services[key] = {
    cwd: entry.cwd,
    port: entry.port ?? existing?.port,
    domains: entry.domains ?? existing?.domains ?? [],
    desiredStatus: entry.desiredStatus ?? existing?.desiredStatus ?? 'running',
  }
  await writeState(state)
}

/** Mark a service stopped while preserving its port allocation. */
export const markServiceStopped = async (
  projectId: string,
  serviceName: string,
): Promise<void> => {
  const state = await readState()
  const key = serviceStateKey(projectId, serviceName)
  const existing = state.services[key]
  if (!existing) return
  state.services[key] = { ...existing, desiredStatus: 'stopped' }
  await writeState(state)
}

/** Remove a service's state entry entirely (used on teardown). */
export const removeServiceState = async (
  projectId: string,
  serviceName: string,
): Promise<void> => {
  const state = await readState()
  const key = serviceStateKey(projectId, serviceName)
  if (!(key in state.services)) return
  delete state.services[key]
  await writeState(state)
}

/**
 * Ports reserved by currently-running services. Stopped services release
 * their port for reuse by other services, but can still reclaim it on
 * restart if nothing else has taken it.
 */
export const reservedPorts = (state: DenvigState): Set<number> => {
  const ports = new Set<number>()
  for (const entry of Object.values(state.services)) {
    if (entry.desiredStatus === 'running' && entry.port !== undefined) {
      ports.add(entry.port)
    }
  }
  return ports
}

/** Get the gateway route for a domain, or null when none is recorded. */
export const getGatewayRoute = async (
  domain: string,
): Promise<GatewayRoute | null> => {
  const state = await readState()
  return state.gatewayRoutes[domain] ?? null
}

/** Write a gateway route, replacing any existing entry for the domain. */
export const setGatewayRoute = async (
  domain: string,
  route: GatewayRoute,
): Promise<void> => {
  const state = await readState()
  state.gatewayRoutes[domain] = route
  await writeState(state)
}

/**
 * Mark every route owned by a given service as stopped so the nginx
 * regenerator skips it. The route entry is preserved so a restart can
 * pick the same port back up.
 */
export const markGatewayRoutesStoppedForService = async (
  projectId: string,
  serviceName: string,
): Promise<void> => {
  const state = await readState()
  let changed = false
  for (const [domain, route] of Object.entries(state.gatewayRoutes)) {
    if (route.project === projectId && route.service === serviceName) {
      state.gatewayRoutes[domain] = { ...route, desiredStatus: 'stopped' }
      changed = true
    }
  }
  if (changed) await writeState(state)
}

/** Remove every gateway route entry owned by a given service. */
export const removeGatewayRoutesForService = async (
  projectId: string,
  serviceName: string,
): Promise<void> => {
  const state = await readState()
  let changed = false
  for (const [domain, route] of Object.entries(state.gatewayRoutes)) {
    if (route.project === projectId && route.service === serviceName) {
      delete state.gatewayRoutes[domain]
      changed = true
    }
  }
  if (changed) await writeState(state)
}
