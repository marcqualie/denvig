import { Command } from '../../lib/command.ts'
import plugins from '../../lib/plugins.ts'

import type { ProjectDependencySchema } from '../../lib/dependencies.ts'

export const depsListCommand = new Command({
  name: 'deps:list',
  description: 'List all dependencies detected by plugins',
  usage: 'deps:list',
  example: 'denvig deps:list',
  args: [],
  flags: [],
  handler: async ({ project }) => {
    const allDependencies: ProjectDependencySchema[] = []

    // Collect dependencies from all plugins
    for (const [_key, plugin] of Object.entries(plugins)) {
      if (plugin.dependencies) {
        const pluginDeps = await plugin.dependencies(project)
        allDependencies.push(...pluginDeps)
      }
    }

    // Deduplicate dependencies by id
    const depsMap = new Map<string, ProjectDependencySchema>()
    for (const dep of allDependencies) {
      const existing = depsMap.get(dep.id)
      if (!existing) {
        depsMap.set(dep.id, dep)
      } else {
        // Merge versions if the dependency already exists
        const mergedVersions = [
          ...new Set([...existing.versions, ...dep.versions]),
        ]
        depsMap.set(dep.id, { ...existing, versions: mergedVersions })
      }
    }

    const dependencies = Array.from(depsMap.values())

    if (dependencies.length === 0) {
      console.log('No dependencies detected in this project.')
      return { success: true, message: 'No dependencies detected.' }
    }

    console.log(`Dependencies for project: ${project.name}`)
    console.log('')

    // Calculate column widths for alignment
    const nameWidth = Math.max(
      ...dependencies.map((d) => d.name.length),
      'NAME'.length,
    )
    const ecosystemWidth = Math.max(
      ...dependencies.map((d) => d.ecosystem.length),
      'ECOSYSTEM'.length,
    )

    // Print header
    console.log(
      `${'NAME'.padEnd(nameWidth)}  ${'ECOSYSTEM'.padEnd(ecosystemWidth)}  VERSIONS`,
    )
    console.log(
      `${''.padEnd(nameWidth, '-')}  ${''.padEnd(ecosystemWidth, '-')}  --------`,
    )

    // Print each dependency
    for (const dep of dependencies) {
      const versions = dep.versions.length > 0 ? dep.versions.join(', ') : '-'
      console.log(
        `${dep.name.padEnd(nameWidth)}  ${dep.ecosystem.padEnd(ecosystemWidth)}  ${versions}`,
      )
    }

    console.log('')
    console.log(
      `${dependencies.length} dependenc${dependencies.length === 1 ? 'y' : 'ies'} detected`,
    )

    return { success: true, message: 'Dependencies listed successfully.' }
  },
})
