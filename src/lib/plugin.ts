import type { ProjectDependencySchema } from './dependencies'
import type { DenvigProject } from './project'

/**
 * Information about an outdated dependency
 */
export type OutdatedDependency = {
  /** Current installed version */
  current: string
  /** Latest version compatible with the specifier (semver) */
  wanted: string
  /** Absolute latest version available */
  latest: string
  /** The version specifier from package.json */
  specifier: string
  /** Whether this is a dev dependency */
  isDevDependency: boolean
}

/**
 * Map of package name to outdated dependency info
 */
export type OutdatedDependencies = Record<string, OutdatedDependency>

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
   * Returns a map of package name to version info.
   */
  outdatedDependencies?: (
    project: DenvigProject,
    options?: OutdatedDependenciesOptions,
  ) => Promise<OutdatedDependencies>
}

export const definePlugin = (options: PluginOptions) => {
  return options
}
