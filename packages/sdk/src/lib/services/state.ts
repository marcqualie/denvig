import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { z } from 'zod'

/**
 * Snapshot of the project the service belongs to, captured at start time
 * so the reconciler can act on the service even when the project lookup
 * tables aren't loaded.
 */
export const ProjectSnapshotSchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  path: z.string(),
})

/**
 * Snapshot of the fields from a service config that are needed to
 * regenerate a plist. Mirrors the relevant pieces of `ServiceConfigSchema`
 * but is duplicated here so state stays independent from the config schema
 * and tolerates older entries.
 */
export const ServiceConfigSnapshotSchema = z.object({
  command: z.string(),
  env: z.record(z.string(), z.string()).optional(),
  envFiles: z.array(z.string()).optional(),
  http: z
    .object({
      port: z.number().optional(),
      domain: z.string().optional(),
      cnames: z.array(z.string()).optional(),
      secure: z.boolean().optional(),
    })
    .optional(),
  keepAlive: z.boolean().optional(),
  startOnBoot: z.boolean().optional(),
})

export const ServiceStateEntrySchema = z.object({
  cwd: z.string(),
  port: z.number().int().positive().optional(),
  domains: z.array(z.string()).default([]),
  /**
   * Temporary domain assigned when the configured domain was owned by
   * another running service. Sticky across stop/start (like `port`) so
   * restarts come back up on the same address; removed on teardown.
   */
  dynamicDomain: z.string().optional(),
  desiredStatus: z.enum(['running', 'stopped']).default('running'),
  /**
   * Project + service config snapshot. Optional so entries written by
   * older versions of denvig still parse — the reconciler skips entries
   * without a snapshot.
   */
  project: ProjectSnapshotSchema.optional(),
  serviceName: z.string().optional(),
  config: ServiceConfigSnapshotSchema.optional(),
})

/**
 * One mapping in the gateway routing table. `defaultService` records
 * whether the route was registered as the natural owner of the domain
 * (`true`, the first claim) or a worktree override (`false`, claimed via
 * the conflict prompt).
 *
 * `cert` is the key into `state.certs` for the cert this route should
 * present in nginx. Only populated for secure routes whose cert was
 * resolved at start time.
 */
export const GatewayRouteSchema = z.object({
  project: z.string(),
  service: z.string(),
  port: z.number().int().positive(),
  defaultService: z.boolean().default(true),
  secure: z.boolean().default(false),
  desiredStatus: z.enum(['running', 'stopped']).default('running'),
  cert: z.string().optional(),
  /**
   * Route for a dynamically assigned (temporary) domain. Temporary routes
   * are removed entirely when their service stops instead of being kept
   * around for a later restart.
   */
  temporary: z.boolean().optional(),
})

/**
 * SSL cert on disk that's been resolved against a domain. Keyed in
 * `state.certs` by the cert directory's basename so multiple routes
 * sharing a wildcard cert reuse a single entry.
 */
export const CertSchema = z.object({
  dir: z.string(),
  certPath: z.string(),
  keyPath: z.string(),
  domains: z.array(z.string()).default([]),
})

export const DenvigStateSchema = z.object({
  services: z.record(z.string(), ServiceStateEntrySchema).default({}),
  gatewayRoutes: z.record(z.string(), GatewayRouteSchema).default({}),
  certs: z.record(z.string(), CertSchema).default({}),
})

export type ProjectSnapshot = z.infer<typeof ProjectSnapshotSchema>
export type ServiceConfigSnapshot = z.infer<typeof ServiceConfigSnapshotSchema>
export type ServiceStateEntry = z.infer<typeof ServiceStateEntrySchema>
export type GatewayRoute = z.infer<typeof GatewayRouteSchema>
export type Cert = z.infer<typeof CertSchema>
export type DenvigState = z.infer<typeof DenvigStateSchema>

const stateFilePath = (): string => resolve(homedir(), '.denvig', 'state.json')

const emptyState = (): DenvigState => ({
  services: {},
  gatewayRoutes: {},
  certs: {},
})

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

/**
 * Merge new fields into a service's state entry. Creates the entry if
 * missing. Passing an explicit `port: undefined` clears a previously
 * recorded port (used when a service no longer needs one); omitting the
 * key preserves it. `dynamicDomain` behaves the same way.
 */
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
    port: 'port' in entry ? entry.port : existing?.port,
    domains: entry.domains ?? existing?.domains ?? [],
    dynamicDomain:
      'dynamicDomain' in entry ? entry.dynamicDomain : existing?.dynamicDomain,
    desiredStatus: entry.desiredStatus ?? existing?.desiredStatus ?? 'running',
    project: entry.project ?? existing?.project,
    serviceName: entry.serviceName ?? existing?.serviceName ?? serviceName,
    config: entry.config ?? existing?.config,
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

/** Remove the gateway route for a single domain. */
export const removeGatewayRoute = async (domain: string): Promise<void> => {
  const state = await readState()
  if (!(domain in state.gatewayRoutes)) return
  delete state.gatewayRoutes[domain]
  await writeState(state)
}

/**
 * Release every gateway route owned by a service when it stops. Temporary
 * routes (dynamically assigned domains) are removed entirely. For regular
 * domains, when another running service declares the domain in its own
 * state entry (the original owner a claim displaced), the route is handed
 * back to it; otherwise the route is just marked stopped so a restart can
 * reclaim it.
 */
export const releaseGatewayRoutesForService = async (
  projectId: string,
  serviceName: string,
): Promise<void> => {
  const state = await readState()
  let changed = false
  for (const [domain, route] of Object.entries(state.gatewayRoutes)) {
    if (route.project !== projectId || route.service !== serviceName) continue
    changed = true
    if (route.temporary) {
      delete state.gatewayRoutes[domain]
      continue
    }
    const heir = Object.values(state.services).find(
      (entry) =>
        entry.desiredStatus === 'running' &&
        entry.project !== undefined &&
        entry.serviceName !== undefined &&
        !(
          entry.project.id === projectId && entry.serviceName === serviceName
        ) &&
        entry.port !== undefined &&
        entry.domains.includes(domain),
    )
    if (heir?.project && heir.serviceName && heir.port !== undefined) {
      state.gatewayRoutes[domain] = {
        project: heir.project.id,
        service: heir.serviceName,
        port: heir.port,
        secure: heir.config?.http?.secure ?? route.secure,
        defaultService: true,
        desiredStatus: 'running',
        cert: route.cert,
      }
    } else {
      state.gatewayRoutes[domain] = { ...route, desiredStatus: 'stopped' }
    }
  }
  if (changed) await writeState(state)
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

/** Get a cert entry by its key (cert directory basename), or null when absent. */
export const getCert = async (key: string): Promise<Cert | null> => {
  const state = await readState()
  return state.certs[key] ?? null
}

/** Write or replace a cert entry keyed by `key` (typically the cert dir basename). */
export const setCert = async (key: string, cert: Cert): Promise<void> => {
  const state = await readState()
  state.certs[key] = cert
  await writeState(state)
}
