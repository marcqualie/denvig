import fs from 'node:fs'

import { detectActions } from './actions/actions.ts'
import {
  type ConfigWithSourcePaths,
  getGlobalConfig,
  getProjectConfig,
} from './config.ts'
import {
  detectDependencies,
  type ProjectDependencySchema,
} from './dependencies.ts'
import plugins from './plugins.ts'

import type { ProjectConfigSchema } from '../schemas/config.ts'
import type { OutdatedDependencies } from './plugin.ts'

export class DenvigProject {
  slug: string
  config: ConfigWithSourcePaths<ProjectConfigSchema>

  constructor(slug: string) {
    this.slug = slug
    this.config = getProjectConfig(slug)
  }

  get name(): string {
    return this.config.name
  }

  get path(): string {
    const globalConfig = getGlobalConfig()
    return `${globalConfig.codeRootDir}/${this.slug}`
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

  async outdatedDependencies(): Promise<OutdatedDependencies> {
    const allOutdated: OutdatedDependencies = {}
    for (const plugin of Object.values(plugins)) {
      if (plugin.outdatedDependencies) {
        const pluginOutdated = await plugin.outdatedDependencies(this)
        Object.assign(allOutdated, pluginOutdated)
      }
    }
    return allOutdated
  }

  /**
   * Return all actions that can be run for the current project.
   */
  get actions() {
    return detectActions(this)
  }

  /**
   * List all files in the root of a project.
   */
  get rootFiles(): string[] {
    return fs.readdirSync(this.path)
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
