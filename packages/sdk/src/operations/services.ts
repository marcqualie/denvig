import { DenvigOperationError, DenvigValidationError } from '../lib/errors.ts'
import { DenvigProject } from '../lib/project.ts'
import { listProjects } from '../lib/projects.ts'
import { createGlobalProject } from '../lib/services/global.ts'
import { getServiceContext } from '../lib/services/identifier.ts'
import launchctl from '../lib/services/launchctl.ts'
import {
  ServiceManager,
  type ServiceResponse,
} from '../lib/services/manager.ts'
import { resolveWorktree } from '../lib/services/worktree.ts'

import type { Worktree } from '../lib/project/worktree.ts'

export type ServiceRuntimeStatus = 'running' | 'stopped' | 'error'

export type ListServicesOptions = {
  /** List services across all projects and global services. */
  all?: boolean
  /** List only global services. */
  global?: boolean
  /** Nest each project's worktree services beneath it. */
  worktrees?: boolean
  /** Target a sibling git worktree by branch name (use "main" for primary). */
  worktree?: string
  /**
   * Filter by runtime status. Accepts a status, a list of statuses, or a
   * comma-separated string; invalid values throw a validation error.
   */
  status?: string | string[]
}

/** A rendered row: a service plus where it sits in the project/worktree tree. */
export type ServiceRow = {
  service: ServiceResponse
  /** 0 for a project's own services, 1 for a worktree's. */
  depth: 0 | 1
  /** Project column text: project slug at depth 0, branch at depth 1. */
  label: string
}

const VALID_STATUSES = new Set<ServiceRuntimeStatus>([
  'running',
  'stopped',
  'error',
])

const normalizeStatusFilter = (
  status: ListServicesOptions['status'],
): ServiceRuntimeStatus[] | null => {
  if (!status) return null
  const list = Array.isArray(status) ? status : status.split(',')
  const normalized = list.map((s) => s.trim().toLowerCase())
  const invalid = normalized.filter(
    (s) => !VALID_STATUSES.has(s as ServiceRuntimeStatus),
  )
  if (invalid.length > 0) {
    throw new DenvigValidationError(
      `Invalid status value(s): ${invalid.join(', ')}. Allowed: running, stopped, error.`,
    )
  }
  return normalized as ServiceRuntimeStatus[]
}

/**
 * Collect the services for a scope into rendered rows. This is the shared data
 * path behind both `denvig services list` and `sdk.services.list()`.
 *
 * Throws {@link DenvigValidationError} on conflicting or invalid options.
 */
export const collectServiceRows = async (
  project: DenvigProject | null,
  worktree: Worktree | null,
  options: ListServicesOptions = {},
): Promise<ServiceRow[]> => {
  const all = !!options.all
  const globalOnly = !!options.global
  const showWorktrees = !!options.worktrees
  const worktreeFlag = options.worktree ?? null
  const statusFilter = normalizeStatusFilter(options.status)

  if ((all || globalOnly) && worktreeFlag !== null) {
    throw new DenvigValidationError(
      'worktree cannot be combined with all or global.',
    )
  }
  if (showWorktrees && (globalOnly || worktreeFlag !== null)) {
    throw new DenvigValidationError(
      'worktrees cannot be combined with global or worktree.',
    )
  }
  if (all && globalOnly) {
    throw new DenvigValidationError(
      'Cannot combine all and global. Choose one.',
    )
  }

  // The default and worktrees scopes operate on the current project; the all
  // and global scopes do not need one.
  const requiresProject = !all && !globalOnly
  if (requiresProject && (!project || !worktree)) {
    throw new DenvigValidationError('No project provided or detected.')
  }

  let activeWorktree = worktree
  if (worktreeFlag !== null && project) {
    activeWorktree = resolveWorktree(project, worktreeFlag)
  }

  // Pre-fetch launchctl list once to avoid N shell calls.
  const launchctlList = await launchctl.list('denvig.')

  const collectFromManager = async (
    manager: ServiceManager,
    depth: 0 | 1,
    label: string,
    out: ServiceRow[],
  ) => {
    const services = await manager.listServices()
    services.sort((a, b) => a.name.localeCompare(b.name))
    for (const service of services) {
      const response = await manager.getServiceResponse(service.name, {
        launchctlList,
      })
      if (response) out.push({ service: response, depth, label })
    }
  }

  const servicesByName = async (manager: ServiceManager) => {
    const map = new Map<string, ServiceResponse>()
    for (const service of await manager.listServices()) {
      const response = await manager.getServiceResponse(service.name, {
        launchctlList,
      })
      if (response) map.set(service.name, response)
    }
    return map
  }

  const collectFamily = async (family: DenvigProject, out: ServiceRow[]) => {
    const primary = family.primaryWorktree
    const primaryServices = await servicesByName(new ServiceManager(primary))

    if (!showWorktrees) {
      for (const name of [...primaryServices.keys()].sort()) {
        const service = primaryServices.get(name)
        if (service) out.push({ service, depth: 0, label: primary.slug })
      }
      return
    }

    const worktrees = []
    for (const wt of family.worktrees.filter((w) => !w.isPrimary)) {
      worktrees.push({
        branch: wt.branch,
        services: await servicesByName(new ServiceManager(wt)),
      })
    }

    const names = new Set<string>(primaryServices.keys())
    for (const wt of worktrees) {
      for (const name of wt.services.keys()) names.add(name)
    }

    for (const name of [...names].sort()) {
      const service = primaryServices.get(name)
      if (service) out.push({ service, depth: 0, label: primary.slug })
      for (const wt of worktrees) {
        const wtService = wt.services.get(name)
        if (wtService) {
          out.push({ service: wtService, depth: 1, label: wt.branch })
        }
      }
    }
  }

  const familiesFromPaths = async (paths: string[]) => {
    const families = new Map<string, DenvigProject>()
    for (const path of paths) {
      const proj = await DenvigProject.retrieve(path)
      const key = proj.primaryWorktree.path
      if (!families.has(key)) families.set(key, proj)
    }
    return [...families.values()].sort((a, b) =>
      a.primaryWorktree.slug.localeCompare(b.primaryWorktree.slug),
    )
  }

  const allServices: ServiceRow[] = []

  if (globalOnly) {
    const globalProject = await createGlobalProject()
    if (Object.keys(globalProject.config.services || {}).length > 0) {
      await collectFromManager(
        new ServiceManager(globalProject),
        0,
        globalProject.slug,
        allServices,
      )
    }
  } else if (all) {
    const families = await familiesFromPaths(
      (await listProjects()).map((p) => p.path),
    )
    for (const family of families) {
      await collectFamily(family, allServices)
    }

    const globalProject = await createGlobalProject()
    if (Object.keys(globalProject.config.services || {}).length > 0) {
      await collectFromManager(
        new ServiceManager(globalProject),
        0,
        globalProject.slug,
        allServices,
      )
    }
  } else if (showWorktrees) {
    // requiresProject guarantees project is non-null here.
    await collectFamily(project as DenvigProject, allServices)
  } else {
    const target = activeWorktree as Worktree
    await collectFromManager(
      new ServiceManager(target),
      0,
      target.slug,
      allServices,
    )
  }

  return statusFilter
    ? allServices.filter((r) => statusFilter.includes(r.service.status))
    : allServices
}

/**
 * List services for a scope, returning the flat service responses.
 */
export const listServices = async (
  project: DenvigProject | null,
  worktree: Worktree | null,
  options: ListServicesOptions = {},
): Promise<ServiceResponse[]> => {
  const rows = await collectServiceRows(project, worktree, options)
  return rows.map((r) => r.service)
}

export type ServiceOperationOptions = {
  /** Target a sibling git worktree by branch name (use "main" for primary). */
  worktree?: string
  /** Include recent log lines in the response. */
  includeLogs?: boolean
}

export type StartServiceOptions = ServiceOperationOptions & {
  /**
   * Explicit domains to route to this start, replacing the domains declared
   * in the service config. Each domain is claimed unconditionally — any
   * existing route is taken over and handed back to a running owner when
   * this service stops. When omitted, the configured domains are used. Pass
   * an empty array to start the service without claiming any domain (it runs
   * on its port only and does not take over an existing route).
   */
  domains?: string[]
  /**
   * The port to start the service on: a specific number, or `'random'` to
   * always allocate a free port. When omitted, the configured port is used,
   * falling back to a random port when it's already in use.
   */
  port?: number | 'random'
}

/**
 * Resolve the manager + service name for a service identifier, applying an
 * optional worktree override.
 */
const resolveServiceTarget = async (
  project: DenvigProject,
  name: string,
  worktreeName?: string,
) => {
  if (worktreeName) {
    project.activeWorktree = resolveWorktree(project, worktreeName)
  }
  return getServiceContext(name, project)
}

/**
 * Get a single service's status response. Throws if the service is unknown.
 */
export const getService = async (
  project: DenvigProject,
  name: string,
  options: ServiceOperationOptions = {},
): Promise<ServiceResponse> => {
  const { manager, serviceName } = await resolveServiceTarget(
    project,
    name,
    options.worktree,
  )
  const response = await manager.getServiceResponse(serviceName, {
    includeLogs: options.includeLogs ?? false,
  })
  if (!response) {
    throw new DenvigValidationError(
      `Service "${serviceName}" not found in configuration.`,
    )
  }
  return response
}

const WAIT_FOR_START_MS = 2000

const waitForStart = () =>
  new Promise((resolve) => setTimeout(resolve, WAIT_FOR_START_MS))

/**
 * Start a service and return its resulting status. Uses non-interactive port
 * resolution (config port, falling back to a random port when busy).
 */
export const startService = async (
  project: DenvigProject,
  name: string,
  options: StartServiceOptions = {},
): Promise<ServiceResponse> => {
  const {
    manager,
    serviceName,
    project: targetProject,
  } = await resolveServiceTarget(project, name, options.worktree)

  const resolution = await manager.resolveServicePort(serviceName, {
    port: options.port,
  })
  const result = await manager.startService(serviceName, {
    port: resolution.success ? resolution.port : undefined,
    portResolved: true,
    domains: options.domains,
  })
  if (!result.success) {
    throw new DenvigOperationError(result.message, {
      service: serviceName,
      project: targetProject.slug,
    })
  }

  await waitForStart()
  const response = await manager.getServiceResponse(serviceName, {
    includeLogs: true,
  })
  if (response?.status === 'running') {
    await manager.reconfigureGateway()
  }
  if (!response) {
    throw new DenvigOperationError('Service failed to start.', {
      service: serviceName,
      project: targetProject.slug,
    })
  }
  return response
}

/**
 * Stop a service and return its resulting status.
 */
export const stopService = async (
  project: DenvigProject,
  name: string,
  options: ServiceOperationOptions = {},
): Promise<ServiceResponse> => {
  const {
    manager,
    serviceName,
    project: targetProject,
  } = await resolveServiceTarget(project, name, options.worktree)

  const result = await manager.stopService(serviceName)
  if (!result.success) {
    throw new DenvigOperationError(result.message, {
      service: serviceName,
      project: targetProject.slug,
    })
  }
  const response = await manager.getServiceResponse(serviceName)
  if (!response) {
    throw new DenvigOperationError(
      `Service "${serviceName}" not found after stopping.`,
      { service: serviceName, project: targetProject.slug },
    )
  }
  return response
}

/**
 * Restart a service and return its resulting status.
 */
export const restartService = async (
  project: DenvigProject,
  name: string,
  options: StartServiceOptions = {},
): Promise<ServiceResponse> => {
  const {
    manager,
    serviceName,
    project: targetProject,
  } = await resolveServiceTarget(project, name, options.worktree)

  const resolution = await manager.resolveServicePort(serviceName, {
    port: options.port,
  })
  const result = await manager.restartService(serviceName, {
    port: resolution.success ? resolution.port : undefined,
    portResolved: true,
    domains: options.domains,
  })
  if (!result.success) {
    throw new DenvigOperationError(result.message, {
      service: serviceName,
      project: targetProject.slug,
    })
  }

  await waitForStart()
  const response = await manager.getServiceResponse(serviceName, {
    includeLogs: true,
  })
  if (response?.status === 'running') {
    await manager.reconfigureGateway()
  }
  if (!response) {
    throw new DenvigOperationError('Service failed to restart.', {
      service: serviceName,
      project: targetProject.slug,
    })
  }
  return response
}
