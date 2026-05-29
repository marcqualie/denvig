import { readdir } from 'node:fs/promises'

import { detectActions } from '../actions/actions.ts'
import { type ConfigWithSourcePaths, getProjectConfig } from '../config.ts'
import {
  detectDependencies,
  type OutdatedDependencySchema,
  type ProjectDependencySchema,
} from '../dependencies.ts'
import plugins from '../plugins.ts'
import { projectRefs } from './refs.ts'

import type { ProjectConfigSchema } from '../../schemas/config.ts'
import type {
  DeduplicateDependenciesOptions,
  DeduplicateResult,
  OutdatedDependenciesOptions,
} from '../plugin.ts'

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
  /** Absolute path of this checkout. */
  readonly path: string
  /** Branch checked out here. The primary checkout always reports `main`. */
  readonly branch: string
  /** True when this is the project's primary checkout. */
  readonly isPrimary: boolean
  /** All identifiers for this checkout. See `projectRefs()` for the format. */
  readonly refs: string[]
  readonly slug: string
  readonly id: string
  config: ConfigWithSourcePaths<ProjectConfigSchema>
  private _rootFilesCache: string[] | null = null

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
    this.refs = projectRefs(path)
    const githubRef = this.refs.find((ref) => ref.startsWith('github:'))
    const localRef = this.refs.find((ref) => ref.startsWith('local:')) as string
    const idRef = this.refs.find((ref) => ref.startsWith('id:')) as string
    this.slug = githubRef ?? localRef
    this.id = idRef.slice('id:'.length)
    this.config = config
    if (rootFiles) {
      this._rootFilesCache = rootFiles
    }
  }

  /** Retrieve a worktree by looking up its config and root files. */
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

  /** List of files in the root of this checkout. */
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

  async dependencies(): Promise<ProjectDependencySchema[]> {
    return await detectDependencies(this)
  }

  async outdatedDependencies(
    options?: OutdatedDependenciesOptions,
  ): Promise<OutdatedDependencySchema[]> {
    const pluginResults = await Promise.all(
      Object.values(plugins).map((plugin) =>
        plugin.outdatedDependencies
          ? plugin.outdatedDependencies(this, options)
          : Promise.resolve([]),
      ),
    )

    return pluginResults.flat()
  }

  async deduplicateDependencies(
    options?: DeduplicateDependenciesOptions,
  ): Promise<DeduplicateResult[]> {
    const results = await Promise.all(
      Object.values(plugins).map((plugin) =>
        plugin.deduplicateDependencies
          ? plugin.deduplicateDependencies(this, options)
          : Promise.resolve(null),
      ),
    )

    return results.filter(
      (result): result is DeduplicateResult => result !== null,
    )
  }

  /** All actions that can be run for this checkout. */
  get actions() {
    return detectActions(this)
  }

  /** All services defined in this checkout's configuration. */
  get services() {
    return this.config.services || {}
  }

  /** Find all files recursively with a given name in this checkout. */
  async findFilesByName(fileName: string): Promise<string[]> {
    const results: string[] = []

    const walk = async (dir: string) => {
      const files = await readdir(dir, { withFileTypes: true })
      for (const file of files) {
        if (file.isDirectory()) {
          if (file.name !== 'node_modules') {
            await walk(`${dir}/${file.name}`)
          }
        } else if (file.name === fileName) {
          results.push(`${dir}/${file.name}`)
        }
      }
    }

    await walk(this.path)
    return results
  }
}
