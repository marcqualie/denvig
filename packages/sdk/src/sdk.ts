import { createCliLogTracker } from './lib/cli-logs.ts'
import { resolveProjectContext } from './lib/context.ts'
import { DenvigSDKError, DenvigValidationError } from './lib/errors.ts'
import { getProjectInfo, type ProjectInfo } from './lib/projectInfo.ts'
import { getDenvigVersion } from './lib/version.ts'
import * as depsOps from './operations/deps.ts'
import { listPlugins, type PluginInfo } from './operations/plugins.ts'
import * as projectsOps from './operations/projects.ts'
import * as servicesOps from './operations/services.ts'

import type { DenvigProject } from './lib/project.ts'
import type {
  Dependency,
  OutdatedDependency,
  ProjectResponse,
  ServiceResponse,
} from './types/responses.ts'

/**
 * Regex pattern for valid client names. Must start with a letter, contain only
 * lowercase alphanumeric and hyphens, and not end with a hyphen.
 */
const CLIENT_NAME_PATTERN = /^[a-z]([a-z0-9-]*[a-z0-9])?$/

export type DenvigSDKOptions = {
  /**
   * Client identifier for the integration using the SDK (required). Used for
   * usage logging to track which integration is calling the SDK. Logs include
   * `via: 'sdk:${client}'` (e.g. `sdk:raycast`).
   */
  client: string

  /**
   * Working directory used to detect the project when no explicit project is
   * given.
   * @default process.cwd()
   */
  cwd?: string
}

export type ListServicesOptions = {
  /** Filter to a specific project slug. When omitted, all projects. */
  project?: string
  /** Filter to a specific worktree branch within the project. */
  worktree?: string
  /** Filter by runtime status. */
  status?: servicesOps.ServiceRuntimeStatus | servicesOps.ServiceRuntimeStatus[]
}

export type ServiceOperationOptions = {
  /** Target a specific git worktree branch by name. */
  worktree?: string
}

export type DepsListOptions = {
  /** Execute in the context of a specific project. */
  project?: string
}

export type DepsOutdatedOptions = {
  /** Execute in the context of a specific project. */
  project?: string
  /** Skip cache and fetch fresh data from registry. */
  noCache?: boolean
  /** Filter by semver level. */
  semver?: depsOps.SemverLevel
  /** Filter to a specific ecosystem. */
  ecosystem?: string
  /** Only show updates released longer ago than this duration. */
  releaseLatency?: string
}

export type ProjectsListOptions = {
  /** Only include projects with a `.denvig.yml` configuration file. */
  withConfig?: boolean
}

/**
 * Denvig SDK for in-process, programmatic access to denvig's logic.
 *
 * Unlike the previous version, this runs the underlying logic directly rather
 * than shelling out to the `denvig` binary.
 *
 * @example
 * ```ts
 * import { DenvigSDK } from 'denvig'
 *
 * const denvig = new DenvigSDK({ client: 'my-app' })
 * const services = await denvig.services.list()
 * const result = await denvig.services.start('api')
 * const outdated = await denvig.deps.outdated()
 * ```
 */
export class DenvigSDK {
  private client: string
  private cwd: string

  constructor(options: DenvigSDKOptions) {
    if (!CLIENT_NAME_PATTERN.test(options.client)) {
      throw new Error(
        `Invalid client name "${options.client}". Must start with a letter, contain only lowercase alphanumeric and hyphens, and not end with a hyphen.`,
      )
    }
    this.client = options.client
    this.cwd = options.cwd ?? process.cwd()
  }

  /**
   * Resolve the project context for an operation.
   */
  private context(project?: string) {
    return resolveProjectContext({ cwd: this.cwd, project })
  }

  /**
   * Require a resolved project, throwing a validation error otherwise.
   */
  private requireProject(project: DenvigProject | null): DenvigProject {
    if (!project) {
      throw new DenvigValidationError('No project provided or detected.')
    }
    return project
  }

  /**
   * Run an operation wrapped in a usage-log entry (`via: sdk:<client>`) and
   * surface failures as {@link DenvigSDKError}.
   */
  private async track<T>(
    command: string,
    slug: string | null,
    fn: () => Promise<T>,
  ): Promise<T> {
    const tracker = createCliLogTracker({
      version: getDenvigVersion(),
      command: `sdk:${command}`,
      path: this.cwd,
      slug: slug ?? undefined,
      via: `sdk:${this.client}`,
    })
    try {
      const result = await fn()
      await tracker.finish(0)
      return result
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      await tracker.finish(1, message.replace(/[\r\n]+/g, ' ').trim())
      if (error instanceof DenvigSDKError) throw error
      throw new DenvigSDKError(`SDK operation failed: ${command}`, message)
    }
  }

  /** Get the version of denvig. */
  async version(): Promise<string> {
    return getDenvigVersion()
  }

  /**
   * Get information about a project (config, refs, worktrees, service status).
   */
  async info(options?: { project?: string }): Promise<ProjectInfo> {
    const ctx = await this.context(options?.project)
    return this.track('info', ctx.slug, () =>
      getProjectInfo(this.requireProject(ctx.project)),
    )
  }

  /**
   * List the available plugins and the actions each resolves for the project.
   */
  async plugins(options?: {
    project?: string
  }): Promise<Record<string, PluginInfo>> {
    const ctx = await this.context(options?.project)
    return this.track('plugins', ctx.slug, () =>
      listPlugins(this.requireProject(ctx.project).activeWorktree),
    )
  }

  services = {
    list: async (options?: ListServicesOptions): Promise<ServiceResponse[]> => {
      if (options?.worktree && !options.project) {
        throw new DenvigValidationError(
          'services.list: `worktree` requires `project` to be specified.',
        )
      }
      const ctx = await this.context(options?.project)
      return this.track('services.list', ctx.slug, () =>
        servicesOps.listServices(
          ctx.project,
          ctx.project?.activeWorktree ?? null,
          {
            all: !options?.project,
            worktree: options?.worktree,
            status: options?.status,
          },
        ),
      )
    },

    status: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const ctx = await this.context()
      return this.track('services.status', ctx.slug, () =>
        servicesOps.getService(this.requireProject(ctx.project), name, {
          worktree: options?.worktree,
          includeLogs: true,
        }),
      )
    },

    start: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const ctx = await this.context()
      return this.track('services.start', ctx.slug, () =>
        servicesOps.startService(this.requireProject(ctx.project), name, {
          worktree: options?.worktree,
        }),
      )
    },

    stop: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const ctx = await this.context()
      return this.track('services.stop', ctx.slug, () =>
        servicesOps.stopService(this.requireProject(ctx.project), name, {
          worktree: options?.worktree,
        }),
      )
    },

    restart: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const ctx = await this.context()
      return this.track('services.restart', ctx.slug, () =>
        servicesOps.restartService(this.requireProject(ctx.project), name, {
          worktree: options?.worktree,
        }),
      )
    },
  }

  deps = {
    list: async (options?: DepsListOptions): Promise<Dependency[]> => {
      const ctx = await this.context(options?.project)
      return this.track('deps.list', ctx.slug, () =>
        depsOps.listDependencies(
          this.requireProject(ctx.project).activeWorktree,
        ),
      )
    },

    outdated: async (
      options?: DepsOutdatedOptions,
    ): Promise<OutdatedDependency[]> => {
      const ctx = await this.context(options?.project)
      return this.track('deps.outdated', ctx.slug, () =>
        depsOps.outdatedDependencies(
          this.requireProject(ctx.project).activeWorktree,
          {
            cache: !options?.noCache,
            semver: options?.semver,
            ecosystem: options?.ecosystem,
            releaseLatency: options?.releaseLatency,
          },
        ),
      )
    },
  }

  projects = {
    list: async (options?: ProjectsListOptions): Promise<ProjectResponse[]> => {
      return this.track('projects.list', null, () =>
        projectsOps.listProjectsInfo({ withConfig: options?.withConfig }),
      )
    },
  }
}
