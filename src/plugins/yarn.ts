import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { DenvigProject } from '../lib/project.ts'

const plugin = definePlugin({
  name: 'yarn',

  actions: async (project: DenvigProject) => {
    const hasPackageJson = project.rootFiles.includes('package.json')
    const hasYarnLock = project.rootFiles.includes('yarn.lock')
    const canHandle = hasPackageJson && hasYarnLock

    if (!canHandle) {
      return {}
    }

    const packageJson = readPackageJson(project)
    const scripts = packageJson?.scripts || ({} as Record<string, string>)
    const actions: Record<string, string[]> = {
      ...Object.entries(scripts)
        .map(([key, script]) => [key, `yarn ${script}`])
        .reduce(
          (acc, [key, script]) => {
            acc[key] = [script]
            return acc
          },
          {} as Record<string, string[]>,
        ),
      install: ['yarn install'],
      outdated: ['yarn outdated'],
    }

    return actions
  },
})

export default plugin
