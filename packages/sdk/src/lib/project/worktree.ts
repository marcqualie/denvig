import { readdir } from 'node:fs/promises'

import { detectActions } from '../actions/actions.ts'
import { type ConfigWithSourcePaths, getProjectConfig } from '../config.ts'
import { appendTraceEvent } from '../debug-trace.ts'
import {
  detectDependencies,
  type OutdatedDependencySchema,
  type ProjectDependencySchema,
  prefixDependencySources,
  type ScopedManifest,
} from '../dependencies.ts'
import plugins from '../plugins.ts'
import { detectManifestDirs, manifestScope } from './manifests.ts'
import { projectIdentity } from './refs.ts'

import type { ProjectConfigSchema } from '../../schemas/config.ts'
import type {
  DeduplicateDependenciesOptions,
  DeduplicateResult,
  OutdatedDependenciesOptions,
} from '../plugin.ts'
import type { GitProviderMatch } from './git-providers.ts'

/**
 * A single git checkout belonging to a project — either the primary checkout
 * or a detached worktree. Everything path-sensitive (config, dependencies,
 * actions, refs) lives here, since these all differ between checkouts.
 *
 * A worktree's `refs`, `id` and `slug` are derived from its own path, so they
 * match the values the legacy `DenvigProject` produced for that checkout. This
 * keeps service state keys (which are derived from these) stable across the
 * project-owns-worktrees refactor.
 */
export class Worktree {
  /**
   * Absolute path of this checkout.
   */
  readonly path: string
  /**
   * Branch checked out here. The primary checkout always reports `main`.
   */
  readonly branch: string
  /**
   * True when this is the project's primary checkout.
   */
  readonly isPrimary: boolean
  /**
   * All identifiers for this checkout. See `projectRefs()` for the format.
   */
  readonly refs: string[]
  readonly slug: string
  readonly id: string
  /**
   * The git provider the slug was derived from, or null for local projects.
   */
  readonly gitProvider: GitProviderMatch | null
  config: ConfigWithSourcePaths<ProjectConfigSchema>
  private _rootFilesCache: string[] | null = null
  private _manifestDirsCache: Promise<string[]> | null = null

  private constructor(
    path: string,
    branch: string,
    isPrimary: boolean,
    config: ConfigWithSourcePaths<ProjectConfigSchema>,
    rootFiles?: string[],
  ) {
    this.path = path
    this.branch = branch
    this.isPrimary = isPrimary
    const identity = projectIdentity(path)
    this.refs = identity.refs
    this.slug = identity.slug
    this.id = identity.id
    this.gitProvider = identity.gitProvider
    this.config = config
    if (rootFiles) {
      this._rootFilesCache = rootFiles
    }
  }

  /**
   * Retrieve a worktree by looking up its config and root files.
   */
  static async retrieve(
    path: string,
    branch: string,
    isPrimary: boolean,
  ): Promise<Worktree> {
    const [config, rootFiles] = await Promise.all([
      getProjectConfig(path),
      readdir(path).catch(() => [] as string[]),
    ])
    return new Worktree(path, branch, isPrimary, config, rootFiles)
  }

  get name(): string {
    return this.config.name ?? this.path.split('/').pop() ?? 'unknown'
  }

  /**
   * List of files in the root of this checkout.
   */
  get rootFiles(): string[] {
    return this._rootFilesCache ?? []
  }

  get packageManagers(): string[] {
    const rootFiles = this.rootFiles
    const packageManagers = []

    if (rootFiles.includes('pnpm-lock.yaml')) {
      packageManagers.push('pnpm')
    } else if (rootFiles.includes('package-lock.json')) {
      packageManagers.push('npm')
    } else if (rootFiles.includes('yarn.lock')) {
      packageManagers.push('yarn')
    }
    if (rootFiles.includes('deno.json') || rootFiles.includes('deno.jsonc')) {
      packageManagers.push('deno')
    }
    if (rootFiles.includes('pyproject.toml')) {
      packageManagers.push('uv')
    }

    return packageManagers
  }

  get primaryPackageManager(): string | null {
    return this.packageManagers[0] || null
  }

  /**
   * Directories (relative to this checkout) that hold their own dependency
   * manifests. Always includes the root (`.`).
   */
  manifestDirs(): Promise<string[]> {
    this._manifestDirsCache ??= detectManifestDirs(this.path)
    return this._manifestDirsCache
  }

  private async manifestScopes(): Promise<ScopedManifest[]> {
    const dirs = await this.manifestDirs()
    return Promise.all(
      dirs.map(async (dir) => ({
        dir,
        scope: dir === '.' ? this : await manifestScope(this.path, dir),
      })),
    )
  }

  async dependencies(): Promise<ProjectDependencySchema[]> {
    return await detectDependencies(await this.manifestScopes())
  }

  async outdatedDependencies(
    options?: OutdatedDependenciesOptions,
  ): Promise<OutdatedDependencySchema[]> {
    const scopes = await this.manifestScopes()
    const pluginResults = await Promise.all(
      scopes.flatMap(({ dir, scope }) =>
        Object.values(plugins).map(async (plugin) => {
          if (!plugin.outdatedDependencies) return []
          const start = performance.now()
          const outdated = await plugin.outdatedDependencies(scope, options)
          appendTraceEvent({
            group: 'denvig',
            scope: 'deps',
            name: `plugin ${plugin.name}`,
            category: 'plugin',
            start,
            args: { path: scope.path, outdated: outdated.length },
          })
          return prefixDependencySources(dir, outdated)
        }),
      ),
    )

    return pluginResults.flat()
  }

  async deduplicateDependencies(
    options?: DeduplicateDependenciesOptions,
  ): Promise<DeduplicateResult[]> {
    const scopes = await this.manifestScopes()
    const results = await Promise.all(
      scopes.flatMap(({ dir, scope }) =>
        Object.values(plugins).map(async (plugin) => {
          const result = await plugin.deduplicateDependencies?.(scope, options)
          if (!result) return null
          return dir === '.'
            ? result
            : { ...result, ecosystem: `${dir}/${result.ecosystem}` }
        }),
      ),
    )

    return results.filter(
      (result): result is DeduplicateResult => result !== null,
    )
  }

  /**
   * All actions that can be run for this checkout.
   */
  get actions() {
    return detectActions(this)
  }

  /**
   * All services defined in this checkout's configuration.
   */
  get services() {
    return this.config.services || {}
  }
}
