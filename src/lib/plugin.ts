import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from './dependencies'
import type { DenvigProject } from './project'

/**
 * Options for outdatedDependencies method
 */
export type OutdatedDependenciesOptions = {
  /** Use cache for registry requests (default: true) */
  cache?: boolean
}

type PluginOptions = {
  name: string

  actions: (project: DenvigProject) => Promise<Record<string, string[]>>

  dependencies?: (project: DenvigProject) => Promise<ProjectDependencySchema[]>

  /**
   * Get outdated dependencies for the project.
   * Returns an array of outdated dependencies with version info.
   */
  outdatedDependencies?: (
    project: DenvigProject,
    options?: OutdatedDependenciesOptions,
  ) => Promise<OutdatedDependencySchema[]>
}

export const definePlugin = (options: PluginOptions) => {
  return options
}
