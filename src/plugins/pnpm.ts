import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

import {
  analyzeDedupeFromParsed,
  applyDedupeChanges,
} from '../lib/dedupe/dedupe.ts'
import { parsePnpmLockForDedupe } from '../lib/dedupe/parse-pnpm.ts'
import { preparePnpmRemovals } from '../lib/dedupe/prepare-removals-pnpm.ts'
import { npmOutdated } from '../lib/npm/outdated.ts'
import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'
import { pathExists } from '../lib/safeReadFile.ts'

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

/**
 * Resolve pnpm dependency aliases where the version field references another package.
 * e.g., depName="wrap-ansi-cjs", depVersion="wrap-ansi@7.0.0" -> { name: "wrap-ansi", version: "7.0.0" }
 * Returns null if not an alias.
 */
const resolveAlias = (
  depVersion: string,
): { name: string; version: string } | null => {
  // Aliases look like "package@version" where it starts with a letter or @scope
  // Normal versions start with a digit
  if (/^\d/.test(depVersion)) return null
  const match = depVersion.match(/^((?:@[^@/]+\/)?[^@]+)@(.+)$/)
  if (match) {
    return { name: match[1], version: match[2] }
  }
  return null
}

const plugin = definePlugin({
  name: 'pnpm',

  actions: async (project: DenvigProject) => {
    const hasPnpmLock = project.rootFiles.includes('pnpm-lock.yaml')
    const canHandle = hasPnpmLock

    if (!canHandle) {
      return {}
    }

    const packageJson = await readPackageJson(project)
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
    if (!(await pathExists(`${project.path}/pnpm-lock.yaml`))) {
      return []
    }

    // Return cached result if available
    const cached = dependenciesCache.get(project.path)
    if (cached) {
      return cached
    }

    const data: Map<string, ProjectDependencySchema> = new Map()
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
    const lockfileContent = await readFile(lockfilePath, 'utf-8')
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
          const alias = resolveAlias(depVersion)
          const actualName = alias ? alias.name : depName
          const cleanVersion = stripPeerDeps(alias ? alias.version : depVersion)
          const source = `pnpm-lock.yaml:${snapshotKey}`
          addDependency(
            `npm:${actualName}`,
            actualName,
            'npm',
            cleanVersion,
            source,
            cleanVersion,
          )
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
    if (!(await pathExists(`${project.path}/pnpm-lock.yaml`))) {
      return []
    }
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies) return []
    return npmOutdated(dependencies, options)
  },

  deduplicateDependencies: async (project, options) => {
    const lockfilePath = `${project.path}/pnpm-lock.yaml`
    if (!(await pathExists(lockfilePath))) {
      return null
    }

    const content = await readFile(lockfilePath, 'utf-8')
    const parsed = parsePnpmLockForDedupe(content)
    const analysis = analyzeDedupeFromParsed(parsed)

    const dryRun = options?.dryRun ?? false
    let applied = false

    if (!dryRun && Object.keys(analysis.removals).length > 0) {
      const optimisedVersionsMap: Record<string, Record<string, string[]>> = {}
      for (const [name, info] of Object.entries(parsed.dependencies)) {
        if (analysis.removals[name] && info.optimisedVersions) {
          optimisedVersionsMap[name] = info.optimisedVersions
        }
      }

      const newContent = preparePnpmRemovals(
        content,
        analysis.removals,
        optimisedVersionsMap,
      )
      await applyDedupeChanges(lockfilePath, newContent, 'pnpm')
      applied = true
    }

    return {
      ecosystem: 'pnpm-lock.yaml',
      ...analysis,
      applied,
    }
  },
})

export default plugin
