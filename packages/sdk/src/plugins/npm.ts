import { readFile } from 'node:fs/promises'

import { npmOutdated } from '../lib/npm/outdated.ts'
import { readPackageJson } from '../lib/packageJson.ts'
import { type NpmLockfile, parseNpmLockfile } from '../lib/parsers/npm.ts'
import { definePlugin } from '../lib/plugin.ts'
import { pathExists } from '../lib/safeReadFile.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { ManifestScope } from '../lib/project/manifests.ts'
import type { Worktree } from '../lib/project/worktree.ts'

// Cache for parsed dependencies by project path
const dependenciesCache = new Map<string, ProjectDependencySchema[]>()

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

  dependencies: async (
    project: ManifestScope,
  ): Promise<ProjectDependencySchema[]> => {
    const lockfilePath = `${project.path}/package-lock.json`
    if (!(await pathExists(lockfilePath))) {
      return []
    }

    const cached = dependenciesCache.get(project.path)
    if (cached) {
      return cached
    }

    let lockfile: NpmLockfile
    try {
      lockfile = JSON.parse(await readFile(lockfilePath, 'utf-8'))
    } catch {
      return []
    }

    // v1 lockfiles do not record the root's declared ranges.
    const rootManifest = lockfile.packages
      ? null
      : await readPackageJson(project)

    const result: ProjectDependencySchema[] = [
      { id: 'npm:npm', name: 'npm', ecosystem: 'system', versions: [] },
      ...parseNpmLockfile(lockfile, rootManifest),
    ]

    dependenciesCache.set(project.path, result)

    return result
  },

  outdatedDependencies: async (project: ManifestScope, options) => {
    if (!(await pathExists(`${project.path}/package-lock.json`))) {
      return []
    }
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies) return []
    return npmOutdated(dependencies, options)
  },
})

export default plugin
