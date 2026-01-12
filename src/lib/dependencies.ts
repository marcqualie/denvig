import { z } from 'zod'

import plugins from './plugins.ts'

import type { DenvigProject } from './project.ts'

/**
 * Schema representing a dependency version with its resolved version string.
 *
 * @example
 * ```json
 * {
 *   "resolved": "18.1.1",
 *   "specifier": "^18.1",
 *   "source": "package.json#dependencies",
 *   "latest": "19.2.5",
 *   "wanted": "18.2.3",
 * }
 * ```
 */
export const ProjectDependencyVersion = z.object({
  resolved: z.string().describe('The resolved version of the dependency'),
  specifier: z.string().describe('The version constraint/specifier used'),
  source: z.string().describe('The source file/path of the dependency'),
  wanted: z
    .string()
    .describe('The wanted version based on semver rules')
    .optional(),
  latest: z
    .string()
    .describe('The latest available version of the dependency')
    .optional(),
})

export const ProjectDependencySchema = z.object({
  id: z.string().describe('Unique identifier for the ecosystem / dependency'),
  name: z.string().describe('Name of the dependency'),
  versions: z
    .array(ProjectDependencyVersion)
    .describe(
      'Map of resolved versions to sources. Each source maps a package path to its version specifier.',
    ),
  ecosystem: z
    .string()
    .describe('Ecosystem of the dependency (e.g., npm, rubygems, pip)'),
})

export type ProjectDependencySchema = z.infer<typeof ProjectDependencySchema>

export const OutdatedDependencySchema = ProjectDependencySchema.extend({
  wanted: z
    .string()
    .describe('Latest version compatible with the specifier (semver)'),
  latest: z.string().describe('Absolute latest version available'),
  specifier: z.string().describe('The version specifier from package manifest'),
  isDevDependency: z.boolean().describe('Whether this is a dev dependency'),
})

export type OutdatedDependencySchema = z.infer<typeof OutdatedDependencySchema>

/**
 * Deduplicate dependencies by id, merging versions arrays for duplicates.
 */
export const dedupeDependencies = (
  dependencies: ProjectDependencySchema[],
): ProjectDependencySchema[] => {
  const depsMap = new Map<string, ProjectDependencySchema>()

  for (const dep of dependencies) {
    const existing = depsMap.get(dep.id)
    if (!existing) {
      depsMap.set(dep.id, dep)
    } else {
      // Merge versions arrays if the dependency already exists
      depsMap.set(dep.id, {
        ...existing,
        versions: [...existing.versions, ...dep.versions],
      })
    }
  }

  return Array.from(depsMap.values())
}

export const detectDependencies = async (
  project: DenvigProject,
): Promise<ProjectDependencySchema[]> => {
  const allDependencies: ProjectDependencySchema[] = []

  for (const [_key, plugin] of Object.entries(plugins)) {
    const pluginDeps = plugin.dependencies
      ? await plugin.dependencies(project)
      : []
    allDependencies.push(...pluginDeps)
  }

  return dedupeDependencies(allDependencies)
}
