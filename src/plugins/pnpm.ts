import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'

import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

type PnpmLockfileDep = {
  specifier: string
  version: string
}

type PnpmLockfileImporter = {
  dependencies?: Record<string, PnpmLockfileDep>
  devDependencies?: Record<string, PnpmLockfileDep>
}

type PnpmLockfile = {
  importers?: Record<string, PnpmLockfileImporter>
}

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
    const data: Map<string, ProjectDependencySchema> = new Map()

    // Helper to add or update a dependency
    const addDependency = (
      id: string,
      name: string,
      ecosystem: string,
      resolvedVersion: string,
      specifier: string,
    ) => {
      const existing = data.get(id)
      if (existing) {
        const versions = existing.versions[resolvedVersion] || []
        if (!versions.includes(specifier)) {
          versions.push(specifier)
        }
        existing.versions[resolvedVersion] = versions
      } else {
        data.set(id, {
          id,
          name,
          ecosystem,
          versions: { [resolvedVersion]: [specifier] },
        })
      }
    }

    // Add system dependencies
    if (existsSync(`${project.path}/yarn.lock`)) {
      data.set('npm:yarn', {
        id: 'npm:yarn',
        name: 'yarn',
        ecosystem: 'system',
        versions: {},
      })
    }
    if (existsSync(`${project.path}/pnpm-lock.yaml`)) {
      data.set('npm:pnpm', {
        id: 'npm:pnpm',
        name: 'pnpm',
        ecosystem: 'system',
        versions: {},
      })
    }

    // Parse the lockfile to get resolved versions
    const lockfilePath = `${project.path}/pnpm-lock.yaml`
    if (existsSync(lockfilePath)) {
      const lockfileContent = readFileSync(lockfilePath, 'utf-8')
      const lockfile = parse(lockfileContent) as PnpmLockfile

      // Iterate through importers (workspace packages)
      if (lockfile?.importers) {
        for (const importer of Object.values(lockfile.importers)) {
          const allDeps = {
            ...importer.dependencies,
            ...importer.devDependencies,
          }
          for (const [name, depInfo] of Object.entries(allDeps)) {
            if (depInfo?.specifier && depInfo?.version) {
              addDependency(
                `npm:${name}`,
                name,
                'npm',
                depInfo.version,
                depInfo.specifier,
              )
            }
          }
        }
      }
    }

    return Array.from(data.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  },
})

export default plugin
