import { existsSync } from 'node:fs'

import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
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
        .map(([key, _script]) => [key, `yarn run ${key}`])
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

  dependencies: async (
    project: DenvigProject,
  ): Promise<ProjectDependencySchema[]> => {
    const data: ProjectDependencySchema[] = []
    if (
      !existsSync(`${project.path}/yarn.lock`) ||
      !existsSync(`${project.path}/package.json`)
    ) {
      return []
    }
    data.push({
      id: 'npm:yarn',
      name: 'yarn',
      ecosystem: 'system',
      versions: {},
    })

    const packageJson = readPackageJson(project)
    if (packageJson?.dependencies) {
      for (const [name, versions] of Object.entries({
        ...packageJson.dependencies,
        ...packageJson.devDependencies,
      })) {
        data.push({
          id: `npm:${name}`,
          name,
          ecosystem: 'npm',
          versions: {},
          // versions: Array.isArray(versions) ? versions : [versions],
        })
      }
    }

    return data
  },
})

export default plugin
