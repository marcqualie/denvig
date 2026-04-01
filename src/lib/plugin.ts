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

/**
 * Options for deduplicateDependencies method
 */
export type DeduplicateDependenciesOptions = {
  /** Only analyze without applying changes (default: false) */
  dryRun?: boolean
}

/**
 * Details of a package that can be deduplicated.
 */
export type DeduplicateDetail = {
  name: string
  versions: string[]
  optimisedVersions: string[]
}

/**
 * Result of a deduplication analysis/operation.
 */
export type DeduplicateResult = {
  ecosystem: string
  totalDependencies: number
  optimisedDependencies: number
  removals: Record<string, string[]>
  details: DeduplicateDetail[]
  applied: boolean
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

  /**
   * Deduplicate lockfile dependencies by combining compatible versions.
   * Returns the analysis result, and applies changes if dryRun is false.
   */
  deduplicateDependencies?: (
    project: DenvigProject,
    options?: DeduplicateDependenciesOptions,
  ) => Promise<DeduplicateResult | null>
}

export const definePlugin = (options: PluginOptions) => {
  return options
}
