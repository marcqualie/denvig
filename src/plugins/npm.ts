import fs from 'node:fs'

import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { DenvigProject } from '../lib/project.ts'

const plugin = definePlugin({
  name: 'npm',

  actions: async (project: DenvigProject) => {
    const rootFiles = fs.readdirSync(project.path)
    const hasPackageJson = rootFiles.includes('package.json')
    const hasPnpmLock = rootFiles.includes('pnpm-lock.yaml')
    const hasNpmLock = rootFiles.includes('package-lock.json')
    const hasYarnLock = rootFiles.includes('yarn.lock')
    const hasDenoConfig =
      rootFiles.includes('deno.json') || rootFiles.includes('deno.jsonc')
    const canHandle =
      hasNpmLock ||
      (hasPackageJson && !hasPnpmLock && !hasYarnLock && !hasDenoConfig)

    if (!canHandle) {
      return {}
    }

    const packageJson = readPackageJson(project)
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
