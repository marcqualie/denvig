import { z } from 'zod'

import plugins from './plugins.ts'

import type { DenvigProject } from './project.ts'

export const ProjectDependencySchema = z.object({
  id: z.string().describe('Unique identifier for the ecosystem / dependency'),
  name: z.string().describe('Name of the dependency'),
  versions: z
    .record(z.string(), z.record(z.string(), z.string()))
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

export const detectDependencies = async (
  project: DenvigProject,
): Promise<ProjectDependencySchema[]> => {
  const allDependencies = []
  for (const [_key, plugin] of Object.entries(plugins)) {
    const pluginDeps = plugin.dependencies
      ? await plugin.dependencies(project)
      : []
    // console.log('pluginDeps', plugin.name, pluginDeps)
    allDependencies.push(...pluginDeps)
  }
  return allDependencies
}
