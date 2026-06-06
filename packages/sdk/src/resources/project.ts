import {
  detectActionsByEcosystem,
  resolveAction,
} from '../lib/actions/resolve.ts'
import {
  buildDependencyTree,
  type TreeDependencyEntry,
} from '../lib/deps/tree.ts'
import { DenvigValidationError } from '../lib/errors.ts'
import { getProjectInfo } from '../lib/projectInfo.ts'
import {
  constructDenvigResourceId,
  generateDenvigResourceHash,
} from '../lib/resources.ts'
import { getServiceContext } from '../lib/services/identifier.ts'
import { resolveWorktree } from '../lib/services/worktree.ts'
import { teardownProject } from '../lib/teardown.ts'
import {
  type DependencyInfo,
  type DependencyInfoOptions,
  dependencyInfo,
  listDependencies,
  outdatedDependencies,
  type SemverLevel,
} from '../operations/deps.ts'
import { listPlugins, type PluginInfo } from '../operations/plugins.ts'
import { collectServiceRows } from '../operations/services.ts'
import { DenvigAction } from './action.ts'
import { track } from './context.ts'
import { DenvigService } from './service.ts'
import { DenvigWorktree } from './worktree.ts'

import type { ConfigWithSourcePaths } from '../lib/config.ts'
import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../lib/dependencies.ts'
import type { Worktree as InternalWorktree } from '../lib/project/worktree.ts'
import type { DenvigProject as InternalProject } from '../lib/project.ts'
import type { GetProjectInfoOptions, ProjectInfo } from '../lib/projectInfo.ts'
import type {
  ServiceManager,
  ServiceManagerProject,
} from '../lib/services/manager.ts'
import type { ProjectTeardownResult } from '../lib/teardown.ts'
import type { ListServicesOptions, ServiceRow } from '../operations/services.ts'
import type { ProjectConfigSchema } from '../schemas/config.ts'
import type { ResourceContext } from './context.ts'

export type ActionRetrieveOptions = {
  /** Target a sibling git worktree by branch name (`main` = primary). */
  worktree?: string
  /** Restrict resolution to a single ecosystem (e.g. `npm`). */
  ecosystem?: string
}

export type ServiceRetrieveOptions = {
  /** Target a sibling git worktree by branch name (`main` = primary). */
  worktree?: string
}

export type DependenciesTreeOptions = {
  /** Include transitive dependencies up to this depth (`0` = direct only). */
  depth?: number
  /** Restrict the tree to a single ecosystem (e.g. `npm`). */
  ecosystem?: string
}

export type DependenciesOutdatedOptions = {
  /** Filter to a specific ecosystem (e.g. `npm`, `rubygems`). */
  ecosystem?: string
  /** Filter by semver level. */
  semver?: SemverLevel
  /** Resolve dependencies in a sibling worktree by branch name. */
  worktree?: string
  /** Only show updates released longer ago than this duration. */
  releaseLatency?: string
  /** Skip cache and fetch fresh data from the registry. */
  noCache?: boolean
}

export type ResourceIdentifierOptions = {
  /** Workspace within the project (defaults to `root`). */
  workspace?: string
  /** Resource reference, e.g. `service/api` or `action/build`. */
  resource: `action/${string}` | `service/${string}`
}

/** A resolved service target: its manager plus the worktree it lives in. */
export type DenvigServiceContext = {
  manager: ServiceManager
  serviceName: string
  /** The checkout (or global project) the service belongs to. */
  target: ServiceManagerProject
}

/**
 * A project — the primary checkout plus its detached worktrees — and the entry
 * point for the chained resource API. Everything path-sensitive is reached
 * through the namespaces below, which act on the active worktree unless an
 * explicit `worktree` is given.
 */
export class DenvigProject {
  private readonly internal: InternalProject
  private readonly ctx: ResourceContext

  constructor(internal: InternalProject, ctx: ResourceContext) {
    this.internal = internal
    this.ctx = ctx
  }

  get id(): string {
    return this.internal.id
  }

  get slug(): string {
    return this.internal.slug
  }

  get name(): string {
    return this.internal.name
  }

  get path(): string {
    return this.internal.path
  }

  get refs(): string[] {
    return this.internal.refs
  }

  /** The checkout this project instance is currently acting on. */
  get activeWorktree(): DenvigWorktree {
    return new DenvigWorktree(this.internal.activeWorktree)
  }

  /** The primary checkout (`main`). */
  get primaryWorktree(): DenvigWorktree {
    return new DenvigWorktree(this.internal.primaryWorktree)
  }

  private worktreeFor(branch?: string): InternalWorktree {
    if (!branch) return this.internal.activeWorktree
    return resolveWorktree(this.internal, branch)
  }

  /**
   * Select the active checkout by branch name (`main` = primary). Subsequent
   * worktree-sensitive operations act on it. Throws if the branch is unknown.
   */
  selectWorktree(branch: string): DenvigWorktree {
    const worktree = resolveWorktree(this.internal, branch)
    this.internal.activeWorktree = worktree
    return new DenvigWorktree(worktree)
  }

  /** Build the project's info summary, including aggregate service status. */
  info(options?: GetProjectInfoOptions): Promise<ProjectInfo> {
    return track(this.ctx, 'projects.info', this.internal.slug, () =>
      getProjectInfo(this.internal, options),
    )
  }

  /** List the available plugins and the actions each resolves. */
  plugins(): Promise<Record<string, PluginInfo>> {
    return track(this.ctx, 'plugins.list', this.internal.slug, () =>
      listPlugins(this.internal.activeWorktree),
    )
  }

  /** Tear down all of the active checkout's services. */
  teardown(options?: { removeLogs?: boolean }): Promise<ProjectTeardownResult> {
    return track(this.ctx, 'projects.teardown', this.internal.slug, () =>
      teardownProject(this.internal, options),
    )
  }

  /** Construct the canonical ID for a resource within this project. */
  resourceId(options: ResourceIdentifierOptions): string {
    return constructDenvigResourceId({ project: this.internal, ...options })
  }

  /** Construct the canonical ID and hash for a resource within this project. */
  resourceHash(
    options: ResourceIdentifierOptions,
  ): ReturnType<typeof generateDenvigResourceHash> {
    return generateDenvigResourceHash({ project: this.internal, ...options })
  }

  worktrees = {
    list: (): DenvigWorktree[] =>
      this.internal.worktrees.map((wt) => new DenvigWorktree(wt)),
    retrieve: (branch: string): DenvigWorktree =>
      new DenvigWorktree(resolveWorktree(this.internal, branch)),
  }

  actions = {
    retrieve: async (
      name: string,
      options?: ActionRetrieveOptions,
    ): Promise<DenvigAction> => {
      const worktree = this.worktreeFor(options?.worktree)
      const resolved = await detectActionsByEcosystem(worktree)
      const action = resolveAction(resolved, name, options?.ecosystem)
      return new DenvigAction(action.name, action.commands, worktree, this.ctx)
    },
  }

  services = {
    retrieve: async (
      name: string,
      options?: ServiceRetrieveOptions,
    ): Promise<DenvigService> =>
      new DenvigService(this.internal, name, options?.worktree, this.ctx),
    /** Collect services for a scope into rendered rows. */
    list: (options?: ListServicesOptions): Promise<ServiceRow[]> =>
      track(this.ctx, 'services.list', this.internal.slug, () =>
        collectServiceRows(
          this.internal,
          this.internal.activeWorktree,
          options,
        ),
      ),
    /**
     * Resolve a service identifier to its manager, name and target checkout.
     * Honours cross-project identifiers (e.g. `slug/service`, `id:abcd/svc`).
     */
    context: async (name: string): Promise<DenvigServiceContext> => {
      const { manager, serviceName, project } = await getServiceContext(
        name,
        this.internal,
      )
      return { manager, serviceName, target: project }
    },
  }

  dependencies = {
    list: (): Promise<ProjectDependencySchema[]> =>
      track(this.ctx, 'dependencies.list', this.internal.slug, () =>
        listDependencies(this.internal.activeWorktree),
      ),
    /**
     * Build the dependency tree for the active worktree. Direct dependencies
     * are the roots; pass `depth` to walk transitive dependencies.
     */
    tree: (options?: DependenciesTreeOptions): Promise<TreeDependencyEntry[]> =>
      track(this.ctx, 'dependencies.tree', this.internal.slug, async () => {
        const all = await listDependencies(this.internal.activeWorktree)
        return buildDependencyTree(all, options?.depth ?? 0, options?.ecosystem)
      }),
    /**
     * Look up registry information for a dependency by `<ecosystem>:<name>`
     * (e.g. `npm:redis`). Returns `null` when the package cannot be found.
     */
    info: (
      identifier: string,
      options?: DependencyInfoOptions,
    ): Promise<DependencyInfo | null> =>
      track(this.ctx, 'dependencies.info', this.internal.slug, () =>
        dependencyInfo(identifier, options),
      ),
    retrieve: async (id: string): Promise<ProjectDependencySchema> => {
      const all = await listDependencies(this.internal.activeWorktree)
      const dependency = all.find((dep) => dep.id === id)
      if (!dependency) {
        throw new DenvigValidationError(`Dependency "${id}" not found.`)
      }
      return dependency
    },
    outdated: (
      options?: DependenciesOutdatedOptions,
    ): Promise<OutdatedDependencySchema[]> => {
      const worktree = this.worktreeFor(options?.worktree)
      return track(this.ctx, 'dependencies.outdated', this.internal.slug, () =>
        outdatedDependencies(worktree, {
          ecosystem: options?.ecosystem,
          semver: options?.semver,
          releaseLatency: options?.releaseLatency,
          cache: options?.noCache ? false : undefined,
        }),
      )
    },
  }

  config = {
    retrieve: (): Promise<ConfigWithSourcePaths<ProjectConfigSchema>> =>
      Promise.resolve(this.internal.activeWorktree.config),
  }
}
