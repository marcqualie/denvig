import { readdir } from 'node:fs/promises'

import { detectActions } from './actions/actions.ts'
import { type ConfigWithSourcePaths, getProjectConfig } from './config.ts'
import {
  detectDependencies,
  type OutdatedDependencySchema,
  type ProjectDependencySchema,
} from './dependencies.ts'
import plugins from './plugins.ts'
import {
  detectProjectWorktrees,
  type ProjectWorktree,
  projectRefs,
} from './project/refs.ts'

import type { ProjectConfigSchema } from '../schemas/config.ts'
import type {
  DeduplicateDependenciesOptions,
  DeduplicateResult,
  OutdatedDependenciesOptions,
} from './plugin.ts'

/**
 * Truncate a project ID for display purposes.
 * Returns the first 8 characters of the ID.
 */
export function shortProjectId(id: string): string {
  return id.slice(0, 8)
}

export class DenvigProject {
  private _path: string
  private _slug: string
  private _id: string
  private _refs: string[]
  private _worktreesCache: ProjectWorktree[] | null = null
  config: ConfigWithSourcePaths<ProjectConfigSchema>
  private _rootFilesCache: string[] | null = null

  private constructor(
    projectPath: string,
    config: ConfigWithSourcePaths<ProjectConfigSchema>,
    rootFiles?: string[],
  ) {
    this._path = projectPath
    this._refs = projectRefs(projectPath)
    const githubRef = this._refs.find((ref) => ref.startsWith('github:'))
    const localRef = this._refs.find((ref) =>
      ref.startsWith('local:'),
    ) as string
    const idRef = this._refs.find((ref) => ref.startsWith('id:')) as string
    this._slug = githubRef ?? localRef
    this._id = idRef.slice('id:'.length)
    this.config = config
    if (rootFiles) {
      this._rootFilesCache = rootFiles
    }
  }

  /**
   * Retrieve a DenvigProject by looking up its config and metadata.
   */
  static async retrieve(projectPath: string): Promise<DenvigProject> {
    const [config, rootFiles] = await Promise.all([
      getProjectConfig(projectPath),
      readdir(projectPath).catch(() => [] as string[]),
    ])
    return new DenvigProject(projectPath, config, rootFiles)
  }

  get slug(): string {
    return this._slug
  }

  get id(): string {
    return this._id
  }

  /**
   * All identifiers for this project. See `projectRefs()` for the format
   * of each ref (`id:`, `local:`, `github:`, `git:`).
   */
  get refs(): string[] {
    return this._refs
  }

  /**
   * Detached git worktrees that belong to this project. The primary
   * checkout is intentionally excluded, so this is `[]` for projects
   * without any `git worktree add`-style sibling checkouts. Computed
   * lazily on first access.
   */
  get worktrees(): ProjectWorktree[] {
    if (this._worktreesCache === null) {
      this._worktreesCache = detectProjectWorktrees(this._path)
    }
    return this._worktreesCache
  }

  get name(): string {
    return this.config.name ?? this._path.split('/').pop() ?? 'unknown'
  }

  get path(): string {
    return this._path
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
    // Run all plugin outdated checks in parallel
    const pluginResults = await Promise.all(
      Object.values(plugins).map((plugin) =>
        plugin.outdatedDependencies
          ? plugin.outdatedDependencies(this, options)
          : Promise.resolve([]),
      ),
    )

    // Flatten all results into a single array
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

  /**
   * Return all actions that can be run for the current project.
   */
  get actions() {
    return detectActions(this)
  }

  /**
   *  Return all services defined in the project configuration.
   */
  get services() {
    return this.config.services || {}
  }

  /**
   * List all files in the root of a project.
   * Pre-loaded during create(), falls back to empty array.
   */
  get rootFiles(): string[] {
    return this._rootFilesCache ?? []
  }

  /**
   * Find all files recursively with a given name in the project.
   */
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

    walk(this.path)
    return results
  }
}
