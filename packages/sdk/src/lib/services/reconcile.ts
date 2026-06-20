import { unlink } from 'node:fs/promises'

import { configureGateway } from '../gateway/configure.ts'
import { resolveProjectCheckouts } from '../projects.ts'
import { createGlobalProject } from './global.ts'
import launchctl from './launchctl.ts'
import { ServiceManager, type ServiceManagerProject } from './manager.ts'
import {
  readState,
  removeGatewayRoutesForService,
  removeServiceState,
  type ServiceStateEntry,
} from './state.ts'

export type ReconcileAction =
  | { type: 'started'; project: string; service: string; reason: string }
  | { type: 'stopped'; project: string; service: string; reason: string }
  | { type: 'restarted'; project: string; service: string; reason: string }
  | { type: 'skipped'; project: string; service: string; reason: string }

export type ReconcileResult = {
  actions: ReconcileAction[]
  errors: Array<{
    project: string
    service: string
    message: string
  }>
}

const LABEL_PREFIX = 'denvig.'

/**
 * Parse a launchctl label of the form `denvig.{projectId}.{serviceName}`.
 * Service names can contain dots, so the project ID is the first segment
 * after `denvig.` (project IDs are sha1 hashes — hex only).
 */
const parseLabel = (
  label: string,
): { projectId: string; serviceName: string } | null => {
  if (!label.startsWith(LABEL_PREFIX)) return null
  const rest = label.slice(LABEL_PREFIX.length)
  const dot = rest.indexOf('.')
  if (dot === -1) return null
  return { projectId: rest.slice(0, dot), serviceName: rest.slice(dot + 1) }
}

/**
 * Build a synthetic `ServiceManagerProject` from a state entry so the
 * ServiceManager can act on services without going back to the live
 * `.denvig.yml`. This is what makes state.json the source of truth — the
 * reconciler operates entirely off the snapshot captured at start time.
 */
const projectFromStateEntry = (
  entry: ServiceStateEntry,
): ServiceManagerProject | null => {
  if (!entry.project || !entry.serviceName || !entry.config) return null
  return {
    id: entry.project.id,
    slug: entry.project.slug,
    name: entry.project.name,
    path: entry.project.path,
    config: {
      services: {
        [entry.serviceName]: {
          // Resolve cwd to absolute so ServiceManager.resolveServiceCwd
          // doesn't double-join the project path. Passing the absolute
          // state cwd works because `resolve()` returns the second arg
          // unchanged when it's already absolute.
          cwd: entry.cwd,
          command: entry.config.command,
          env: entry.config.env,
          envFiles: entry.config.envFiles,
          http: entry.config.http,
          keepAlive: entry.config.keepAlive,
          startOnBoot: entry.config.startOnBoot,
        },
      },
    },
  }
}

/**
 * Reconcile actual launchctl state with the desired state recorded in
 * `~/.denvig/state.json`.
 *
 * Categories of action:
 * 0. A service whose recorded checkout no longer resolves to a real
 *    project (a deleted worktree) is orphaned → bootout it, drop its plist
 *    and remove its state and gateway routes so the project that
 *    legitimately owns its domain can reclaim it.
 * 1. State says running, launchctl agrees, plist matches → no-op.
 * 2. State says running, but launchctl is missing the service or the
 *    plist on disk differs from what the snapshot would produce → call
 *    startService (idempotent: it only re-bootstraps when the plist
 *    content actually changed).
 * 3. launchctl has a `denvig.*` service that state doesn't know about,
 *    or marks as `desiredStatus: stopped` → bootout it.
 */
export const reconcileServices = async (): Promise<ReconcileResult> => {
  const state = await readState()
  const launchctlEntries = await launchctl.list(LABEL_PREFIX)
  const result: ReconcileResult = { actions: [], errors: [] }

  // Index launchctl entries by label for quick lookup.
  const launchctlByLabel = new Map<
    string,
    { projectId: string; serviceName: string }
  >()
  for (const item of launchctlEntries) {
    const parsed = parseLabel(item.label)
    if (parsed) launchctlByLabel.set(item.label, parsed)
  }

  // Labels we shouldn't bootout in pass 2 — either because we've launched
  // them ourselves or because state claims them (even if we can't act on
  // them yet due to a missing snapshot).
  const protectedLabels = new Set<string>()

  // Helper: derive the launchctl label from a serviceStateKey
  // (`id:<projectId>:<serviceName>`). Used when we can't construct a full
  // ServiceManager from the state entry (legacy entry without snapshot).
  const labelFromKey = (key: string): string | null => {
    if (!key.startsWith('id:')) return null
    const rest = key.slice(3)
    const colon = rest.indexOf(':')
    if (colon === -1) return null
    return `${LABEL_PREFIX}${rest.slice(0, colon)}.${rest.slice(colon + 1)}`
  }

  // Pass 0: prune orphaned services and routes. A service whose recorded
  // checkout no longer resolves to its captured project id (the worktree was
  // deleted) would otherwise be resurrected by pass 1 on every run —
  // recreating the checkout directory, re-bootstrapping a launchd agent and
  // holding the service's gateway domain hostage from the project that
  // legitimately owns it. Tearing it down here lets the real service reclaim
  // its domain in pass 1.
  const checkouts = await resolveProjectCheckouts()
  const knownProjectIds = new Set(checkouts.keys())
  knownProjectIds.add((await createGlobalProject()).id)

  let prunedOrphan = false
  for (const [key, entry] of Object.entries(state.services)) {
    if (!entry.project || !entry.serviceName) continue
    if (knownProjectIds.has(entry.project.id)) continue

    prunedOrphan = true
    const project = projectFromStateEntry(entry)
    let label: string | null
    if (project) {
      const manager = new ServiceManager(project)
      label = manager.getServiceLabel(entry.serviceName)
      await unlink(manager.getPlistPath(entry.serviceName)).catch(() => {})
    } else {
      label = labelFromKey(key)
    }
    if (label) {
      await launchctl.bootout(label)
      // Already handled — keep pass 2 from booting the stale label again.
      protectedLabels.add(label)
    }
    await removeServiceState(entry.project.id, entry.serviceName)
    await removeGatewayRoutesForService(entry.project.id, entry.serviceName)
    delete state.services[key]
    result.actions.push({
      type: 'stopped',
      project: entry.project.slug,
      service: entry.serviceName,
      reason: 'checkout no longer exists; removed orphaned service',
    })
  }

  // Sweep any remaining gateway routes whose owner no longer resolves —
  // covers routes left behind without a matching service entry.
  for (const [, route] of Object.entries(state.gatewayRoutes)) {
    if (knownProjectIds.has(route.project)) continue
    prunedOrphan = true
    await removeGatewayRoutesForService(route.project, route.service)
  }

  // Pass 1: drive state entries with desiredStatus 'running' towards being
  // bootstrapped with up-to-date plists.
  for (const [key, entry] of Object.entries(state.services)) {
    if (entry.desiredStatus !== 'running') continue
    const project = projectFromStateEntry(entry)
    if (!project || !entry.serviceName) {
      // Legacy entry without a snapshot — leave it bootstrapped but skip
      // the reconcile action. Protect the label so pass 2 doesn't tear it
      // down on a partial migration.
      const legacyLabel = labelFromKey(key)
      if (legacyLabel) protectedLabels.add(legacyLabel)
      continue
    }
    const manager = new ServiceManager(project)
    const label = manager.getServiceLabel(entry.serviceName)
    protectedLabels.add(label)
    try {
      const start = await manager.startService(entry.serviceName, {
        // Non-http services never need a port — drop any stale allocation
        // recorded by an older version.
        port: entry.config?.http ? entry.port : undefined,
        portResolved: true,
        // Re-apply the exact domain claim recorded in state rather than
        // recomputing from config. This preserves a "no claim" start
        // (domains: []) — without it, the reconciler would re-expand to the
        // configured domains and steal a route the user chose not to take.
        domains: entry.domains,
        // Liveness is launchd's job — only re-bootstrap on a real plist
        // change, never just because the process is momentarily down.
        reviveIfNotRunning: false,
      })
      if (!start.success) {
        result.errors.push({
          project: project.slug,
          service: entry.serviceName,
          message: start.message,
        })
        continue
      }
      if (start.message === 'Service already running with current config') {
        result.actions.push({
          type: 'skipped',
          project: project.slug,
          service: entry.serviceName,
          reason: 'already running with current config',
        })
      } else if (launchctlByLabel.has(label)) {
        result.actions.push({
          type: 'restarted',
          project: project.slug,
          service: entry.serviceName,
          reason: 'config changed since last bootstrap',
        })
      } else {
        result.actions.push({
          type: 'started',
          project: project.slug,
          service: entry.serviceName,
          reason: 'desiredStatus is running but service was not bootstrapped',
        })
      }
    } catch (e) {
      result.errors.push({
        project: project.slug,
        service: entry.serviceName,
        message: e instanceof Error ? e.message : String(e),
      })
    }
  }

  // Pass 2: bootout any launchctl entries that state doesn't claim.
  for (const item of launchctlEntries) {
    if (protectedLabels.has(item.label)) continue
    const bootoutResult = await launchctl.bootout(item.label)
    const parsed = parseLabel(item.label)
    const slug = parsed?.projectId.slice(0, 8) ?? 'unknown'
    const serviceName = parsed?.serviceName ?? item.label
    if (bootoutResult.success) {
      result.actions.push({
        type: 'stopped',
        project: slug,
        service: serviceName,
        reason: 'no matching entry in state.json',
      })
    } else {
      result.errors.push({
        project: slug,
        service: serviceName,
        message: `Failed to bootout: ${bootoutResult.output}`,
      })
    }
  }

  // Regenerate nginx after pruning orphans so the domain the real service
  // reclaimed in pass 1 is rendered (and the orphan's stale config dropped).
  if (prunedOrphan) {
    await configureGateway()
  }

  return result
}
