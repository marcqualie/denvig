import { createHash } from 'node:crypto'
import fs from 'node:fs'

import { detectActions } from './actions/actions.ts'
import { type ConfigWithSourcePaths, getProjectConfig } from './config.ts'
import {
  detectDependencies,
  type OutdatedDependencySchema,
  type ProjectDependencySchema,
} from './dependencies.ts'
import { getProjectSlug } from './git.ts'
import plugins from './plugins.ts'

import type { ProjectConfigSchema } from '../schemas/config.ts'
import type { OutdatedDependenciesOptions } from './plugin.ts'

/**
 * Generate a unique project ID from the absolute path.
 * Returns the full SHA1 hash of the path.
 */
export function projectId(absolutePath: string): string {
  return createHash('sha1').update(absolutePath).digest('hex')
}

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
  config: ConfigWithSourcePaths<ProjectConfigSchema>
  private _rootFilesCache: string[] | null = null

  constructor(projectPath: string) {
    this._path = projectPath
    this._slug = getProjectSlug(projectPath)
    this._id = projectId(projectPath)
    this.config = getProjectConfig(projectPath)
  }

  get slug(): string {
    return this._slug
  }

  get id(): string {
    return this._id
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
   * Cached on first access to avoid repeated filesystem calls.
   */
  get rootFiles(): string[] {
    if (this._rootFilesCache === null) {
      this._rootFilesCache = fs.readdirSync(this.path)
    }
    return this._rootFilesCache
  }

  /**
   * Find all files recursively with a given name in the project.
   */
  findFilesByName(fileName: string): string[] {
    const results: string[] = []

    const walk = (dir: string) => {
      const files = fs.readdirSync(dir, { withFileTypes: true })
      for (const file of files) {
        if (file.isDirectory()) {
          if (file.name !== 'node_modules') {
            walk(`${dir}/${file.name}`)
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
