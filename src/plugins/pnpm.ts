import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'

import { npmOutdated } from '../lib/npm/outdated.ts'
import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

// Cache for parsed dependencies by project path
const dependenciesCache = new Map<string, ProjectDependencySchema[]>()

type PnpmLockfileDep = {
  specifier: string
  version: string
}

type PnpmLockfileImporter = {
  dependencies?: Record<string, PnpmLockfileDep>
  devDependencies?: Record<string, PnpmLockfileDep>
}

type PnpmSnapshotDep = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

type PnpmLockfile = {
  importers?: Record<string, PnpmLockfileImporter>
  snapshots?: Record<string, PnpmSnapshotDep>
}

/**
 * Strip peer dependency qualifiers from version strings.
 * e.g., "8.5.0(typescript@5.9.3)(yaml@2.8.1)" -> "8.5.0"
 */
const stripPeerDeps = (version: string): string => {
  const parenIndex = version.indexOf('(')
  return parenIndex === -1 ? version : version.slice(0, parenIndex)
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

  dependencies: async (
    project: DenvigProject,
  ): Promise<ProjectDependencySchema[]> => {
    if (!existsSync(`${project.path}/pnpm-lock.yaml`)) {
      return []
    }

    // Return cached result if available
    const cached = dependenciesCache.get(project.path)
    if (cached) {
      return cached
    }

    const data: Map<string, ProjectDependencySchema> = new Map()
    const directDependencies: Set<string> = new Set()

    // Helper to add a dependency version entry
    const addDependency = (
      id: string,
      name: string,
      ecosystem: string,
      resolvedVersion: string,
      source: string,
      specifier: string,
    ) => {
      const existing = data.get(id)
      if (existing) {
        existing.versions.push({
          resolved: resolvedVersion,
          specifier,
          source,
        })
      } else {
        data.set(id, {
          id,
          name,
          ecosystem,
          versions: [{ resolved: resolvedVersion, specifier, source }],
        })
      }
    }

    data.set('npm:pnpm', {
      id: 'npm:pnpm',
      name: 'pnpm',
      ecosystem: 'system',
      versions: [],
    })

    // Parse the lockfile to get resolved versions
    const lockfilePath = `${project.path}/pnpm-lock.yaml`
    const lockfileContent = readFileSync(lockfilePath, 'utf-8')
    const lockfile = parse(lockfileContent) as PnpmLockfile

    // Iterate through importers (workspace packages)
    if (lockfile?.importers) {
      for (const [importerPath, importer] of Object.entries(
        lockfile.importers,
      )) {
        const basePath = importerPath === '.' ? '.' : importerPath

        // Process dependencies
        if (importer.dependencies) {
          for (const [name, depInfo] of Object.entries(importer.dependencies)) {
            if (depInfo?.specifier && depInfo?.version) {
              directDependencies.add(name)
              addDependency(
                `npm:${name}`,
                name,
                'npm',
                stripPeerDeps(depInfo.version),
                `${basePath}#dependencies`,
                depInfo.specifier,
              )
            }
          }
        }

        // Process devDependencies
        if (importer.devDependencies) {
          for (const [name, depInfo] of Object.entries(
            importer.devDependencies,
          )) {
            if (depInfo?.specifier && depInfo?.version) {
              directDependencies.add(name)
              addDependency(
                `npm:${name}`,
                name,
                'npm',
                stripPeerDeps(depInfo.version),
                `${basePath}#devDependencies`,
                depInfo.specifier,
              )
            }
          }
        }
      }
    }

    // Add transitive dependencies from snapshots
    if (lockfile?.snapshots) {
      for (const [snapshotKey, snapshot] of Object.entries(
        lockfile.snapshots,
      )) {
        const transitiveDeps = {
          ...snapshot.dependencies,
        }
        for (const [depName, depVersion] of Object.entries(transitiveDeps)) {
          if (!directDependencies.has(depName)) {
            const cleanVersion = stripPeerDeps(depVersion)
            const source = `pnpm-lock.yaml:${snapshotKey}`
            addDependency(
              `npm:${depName}`,
              depName,
              'npm',
              cleanVersion,
              source,
              cleanVersion,
            )
          }
        }
      }
    }

    const result = Array.from(data.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )

    // Cache the result for subsequent calls
    dependenciesCache.set(project.path, result)

    return result
  },

  outdatedDependencies: async (project: DenvigProject, options) => {
    if (!existsSync(`${project.path}/pnpm-lock.yaml`)) {
      return []
    }
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies) return []
    return npmOutdated(dependencies, options)
  },
})

export default plugin
