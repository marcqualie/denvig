import {
  detectActionsByEcosystem,
  resolveAction,
} from '../lib/actions/resolve.ts'
import {
  buildDependencyTree,
  type TreeDependencyEntry,
} from '../lib/deps/tree.ts'
import { DenvigValidationError } from '../lib/errors.ts'
import { resolveWorktree } from '../lib/services/worktree.ts'
import {
  type DependencyInfo,
  type DependencyInfoOptions,
  dependencyInfo,
  listDependencies,
  outdatedDependencies,
  type SemverLevel,
} from '../operations/deps.ts'
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

  private worktreeFor(branch?: string): InternalWorktree {
    if (!branch) return this.internal.activeWorktree
    return resolveWorktree(this.internal, branch)
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
