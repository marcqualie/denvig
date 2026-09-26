import { githubActionsOutdated } from '../lib/github-actions/outdated.ts'
import { parseGitHubActionsDependencies } from '../lib/github-actions/parse.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { Worktree } from '../lib/project/worktree.ts'

// Cache for parsed dependencies by project path
const dependenciesCache = new Map<string, ProjectDependencySchema[]>()

const plugin = definePlugin({
  name: 'github-actions',

  actions: async () => ({}),

  dependencies: async (
    project: Worktree,
  ): Promise<ProjectDependencySchema[]> => {
    const cached = dependenciesCache.get(project.path)
    if (cached) return cached

    const result = await parseGitHubActionsDependencies(project)
    dependenciesCache.set(project.path, result)
    return result
  },

  outdatedDependencies: async (project, options) => {
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies?.length) return []
    return githubActionsOutdated(dependencies, options)
  },
})

export default plugin
