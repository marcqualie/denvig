import fs, { existsSync } from 'node:fs'

import { type PackageJson, readPackageJson } from '../lib/packageJson.ts'
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

  dependencies: async (project: DenvigProject) => {
    const data = []
    if (existsSync(`${project.path}/yarn.lock`)) {
      data.push({
        id: 'npm:yarn',
        name: 'yarn',
        ecosystem: 'system',
        versions: [],
      })
    }
    if (existsSync(`${project.path}/pnpm-lock.yaml`)) {
      data.push({
        id: 'npm:pnpm',
        name: 'pnpm',
        ecosystem: 'system',
        versions: [],
      })
    }

    // find all package.json files from the project root, ignoring node_modules folders
    const packageJsonPaths = project.findFilesByName('package.json')

    for (const packageJsonPath of packageJsonPaths) {
      const packageJsonContent = fs.readFileSync(packageJsonPath, 'utf-8')
      const packageJson = JSON.parse(packageJsonContent) as PackageJson
      if (packageJson?.dependencies) {
        for (const [name, versions] of Object.entries({
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        })) {
          data.push({
            id: `npm:${name}`,
            name,
            ecosystem: 'npm',
            versions: Array.isArray(versions) ? versions : [versions],
          })
        }
      }
    }

    return data.sort((a, b) => a.name.localeCompare(b.name))
  },
})

export default plugin
