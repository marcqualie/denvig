import { definePlugin } from '../lib/plugin.ts'
import { uvOutdated } from '../lib/uv/outdated.ts'
import { parseUvDependencies } from '../lib/uv/parse.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

// Cache for parsed dependencies by project path
const dependenciesCache = new Map<string, ProjectDependencySchema[]>()

const plugin = definePlugin({
  name: 'uv',

  actions: async (project: DenvigProject) => {
    const rootFiles = project.rootFiles
    const hasPyProject = rootFiles.includes('pyproject.toml')
    const hasUvLock = rootFiles.includes('uv.lock')
    const canHandle = hasUvLock || hasPyProject

    if (!canHandle) {
      return {}
    }

    const actions: Record<string, string[]> = {
      install: ['uv sync'],
    }

    return actions
  },

  dependencies: async (
    project: DenvigProject,
  ): Promise<ProjectDependencySchema[]> => {
    const hasPyProject = project.rootFiles.includes('pyproject.toml')
    const hasUvLock = project.rootFiles.includes('uv.lock')
    if (!hasPyProject && !hasUvLock) {
      return []
    }

    // Return cached result if available
    const cached = dependenciesCache.get(project.path)
    if (cached) {
      return cached
    }

    const result = await parseUvDependencies(project)

    // Cache the result for subsequent calls
    dependenciesCache.set(project.path, result)

    return result
  },

  outdatedDependencies: async (project, options) => {
    const hasPyProject = project.rootFiles.includes('pyproject.toml')
    if (!hasPyProject) {
      return []
    }
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies) return []
    return uvOutdated(dependencies, options)
  },
})

export default plugin
