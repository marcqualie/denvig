import type { ConfigWithSourcePaths } from '../lib/config.ts'
import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../lib/dependencies.ts'
import type {
  DeduplicateDependenciesOptions,
  DeduplicateResult,
  OutdatedDependenciesOptions,
} from '../lib/plugin.ts'
import type { Worktree as InternalWorktree } from '../lib/project/worktree.ts'
import type { ProjectConfigSchema } from '../schemas/config.ts'

/**
 * A public view of a single git checkout belonging to a project. Identity
 * (`name`/`branch`/`path`/`slug`/`id`) plus the path-sensitive config, actions,
 * services and dependencies for this checkout are reached from here.
 */
export class DenvigWorktree {
  private readonly _internal: InternalWorktree

  constructor(internal: InternalWorktree) {
    this._internal = internal
  }

  /** The underlying internal worktree. Not part of the public contract. */
  get internal(): InternalWorktree {
    return this._internal
  }

  get name(): string {
    return this._internal.name
  }

  get branch(): string {
    return this._internal.branch
  }

  get path(): string {
    return this._internal.path
  }

  get slug(): string {
    return this._internal.slug
  }

  get id(): string {
    return this._internal.id
  }

  get isPrimary(): boolean {
    return this._internal.isPrimary
  }

  /** This checkout's resolved configuration (with source paths). */
  get config(): ConfigWithSourcePaths<ProjectConfigSchema> {
    return this._internal.config
  }

  /** Services defined in this checkout's configuration. */
  get services(): NonNullable<ProjectConfigSchema['services']> {
    return this._internal.services
  }

  /** All actions runnable for this checkout, keyed by name. */
  get actions(): Promise<Record<string, string[]>> {
    return this._internal.actions
  }

  /** Detect all dependencies for this checkout. */
  dependencies(): Promise<ProjectDependencySchema[]> {
    return this._internal.dependencies()
  }

  /** Resolve outdated dependencies for this checkout. */
  outdatedDependencies(
    options?: OutdatedDependenciesOptions,
  ): Promise<OutdatedDependencySchema[]> {
    return this._internal.outdatedDependencies(options)
  }

  /** Deduplicate this checkout's lockfile dependencies. */
  deduplicateDependencies(
    options?: DeduplicateDependenciesOptions,
  ): Promise<DeduplicateResult[]> {
    return this._internal.deduplicateDependencies(options)
  }
}
