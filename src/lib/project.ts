import fs from 'node:fs'

import { detectActions } from './actions/actions.ts'
import {
  type ConfigWithSourcePaths,
  getGlobalConfig,
  getProjectConfig,
} from './config.ts'
import { detectDependencies } from './dependencies.ts'

import type { ProjectConfigSchema } from '../schemas/config.ts'

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

    if (
      rootFiles.includes('pnpm-lock.yaml') ||
      rootFiles.includes('package.json')
    ) {
      packageManagers.push('pnpm')
    }
    if (
      rootFiles.includes('package-lock.json') ||
      rootFiles.includes('package.json')
    ) {
      packageManagers.push('npm')
    }
    if (rootFiles.includes('yarn.lock')) {
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

  get dependencies() {
    return detectDependencies(this)
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
}
