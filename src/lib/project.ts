import { detectActions } from './actions.ts'
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

  get dependencies() {
    return detectDependencies(this)
  }

  get actions() {
    return detectActions(this)
  }
}
