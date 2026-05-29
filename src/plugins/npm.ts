import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { Worktree } from '../lib/project/worktree.ts'

const plugin = definePlugin({
  name: 'npm',

  actions: async (project: Worktree) => {
    const rootFiles = project.rootFiles
    const hasPackageJson = rootFiles.includes('package.json')
    const hasNpmLock = rootFiles.includes('package-lock.json')
    const canHandle = hasPackageJson && hasNpmLock

    if (!canHandle) {
      return {}
    }

    const packageJson = await readPackageJson(project)
    const scripts = packageJson?.scripts || ({} as Record<string, string>)
    const actions: Record<string, string[]> = {
      ...Object.entries(scripts)
        .map(([key, _script]) => [key, `npm run ${key}`])
        .reduce(
          (acc, [key, script]) => {
            acc[key] = [script]
            return acc
          },
          {} as Record<string, string[]>,
        ),
      install: ['npm install'],
      outdated: ['npm outdated'],
    }

    return actions
  },
})

export default plugin
