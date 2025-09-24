import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { DenvigProject } from '../lib/project.ts'

const plugin = definePlugin({
  name: 'pnpm',

  actions: async (project: DenvigProject) => {
    const hasPnpmLock = project.rootFiles.includes('pnpm-lock.yaml')
    const canHandle = hasPnpmLock

    if (!canHandle) {
      return {}
    }

    const packageJson = readPackageJson(project)
    const scripts = packageJson?.scripts || ({} as Record<string, string>)
    const isWorkspace = project.rootFiles.includes('pnpm-workspace.yaml')
    const actions: Record<string, string[]> = {
      ...Object.entries(scripts)
        .map(([key, _script]) => [key, `pnpm run ${key}`])
        .reduce(
          (acc, [key, script]) => {
            acc[key] = [script]
            return acc
          },
          {} as Record<string, string[]>,
        ),
      install: ['pnpm install'],
      outdated: [isWorkspace ? 'pnpm outdated -r' : 'pnpm outdated'],
    }

    return actions
  },
})

export default plugin
