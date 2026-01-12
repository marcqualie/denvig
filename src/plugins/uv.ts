import fs from 'node:fs'

import { definePlugin } from '../lib/plugin.ts'
import { uvOutdated } from '../lib/uv/outdated.ts'
import { parseUvDependencies } from '../lib/uv/parse.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

const plugin = definePlugin({
  name: 'uv',

  actions: async (project: DenvigProject) => {
    const rootFiles = fs.readdirSync(project.path)
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
    return parseUvDependencies(project)
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
