import { existsSync, readFileSync } from 'node:fs'
import { parse } from 'yaml'

import { readPackageJson } from '../lib/packageJson.ts'
import { definePlugin } from '../lib/plugin.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { OutdatedDependencies } from '../lib/plugin.ts'
import type { DenvigProject } from '../lib/project.ts'

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
 * Parse a semver version string into components.
 */
const parseVersion = (
  version: string,
): {
  major: number
  minor: number
  patch: number
  prerelease: string
} | null => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)(?:-(.+))?$/)
  if (!match) return null
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
    prerelease: match[4] || '',
  }
}

/**
 * Compare two semver versions.
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
const compareVersions = (a: string, b: string): number => {
  const va = parseVersion(a)
  const vb = parseVersion(b)
  if (!va || !vb) return 0

  if (va.major !== vb.major) return va.major - vb.major
  if (va.minor !== vb.minor) return va.minor - vb.minor
  if (va.patch !== vb.patch) return va.patch - vb.patch

  // Prerelease versions have lower precedence
  if (va.prerelease && !vb.prerelease) return -1
  if (!va.prerelease && vb.prerelease) return 1

  return 0
}

/**
 * Check if a version satisfies a semver range specifier.
 * Supports: ^x.y.z, ~x.y.z, x.y.z (exact), >=x.y.z, >x.y.z
 */
const satisfiesRange = (version: string, specifier: string): boolean => {
  const v = parseVersion(version)
  if (!v) return false

  // Skip prerelease versions for compatibility checks
  if (v.prerelease) return false

  // Handle caret range (^) - compatible with major version
  if (specifier.startsWith('^')) {
    const base = parseVersion(specifier.slice(1))
    if (!base) return false

    // For ^0.x.y, minor version must match
    if (base.major === 0) {
      return v.major === 0 && v.minor === base.minor && v.patch >= base.patch
    }

    // For ^x.y.z where x > 0, major version must match
    return (
      v.major === base.major &&
      compareVersions(version, specifier.slice(1)) >= 0
    )
  }

  // Handle tilde range (~) - compatible with minor version
  if (specifier.startsWith('~')) {
    const base = parseVersion(specifier.slice(1))
    if (!base) return false

    return (
      v.major === base.major && v.minor === base.minor && v.patch >= base.patch
    )
  }

  // Handle >= range
  if (specifier.startsWith('>=')) {
    return compareVersions(version, specifier.slice(2)) >= 0
  }

  // Handle > range
  if (specifier.startsWith('>') && !specifier.startsWith('>=')) {
    return compareVersions(version, specifier.slice(1)) > 0
  }

  // Exact version match
  const base = parseVersion(specifier)
  if (!base) return false
  return (
    v.major === base.major && v.minor === base.minor && v.patch === base.patch
  )
}

/**
 * Fetch package info from npm registry.
 */
const fetchNpmPackageInfo = async (
  packageName: string,
): Promise<{ versions: string[]; latest: string } | null> => {
  try {
    const response = await fetch(
      `https://registry.npmjs.org/${encodeURIComponent(packageName)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!response.ok) return null

    const data = (await response.json()) as {
      versions: Record<string, unknown>
      'dist-tags': { latest: string }
    }

    const versions = Object.keys(data.versions)
    const latest = data['dist-tags']?.latest || versions[versions.length - 1]

    return { versions, latest }
  } catch {
    return null
  }
}

/**
 * Find the highest version that satisfies a specifier.
 */
const findWantedVersion = (
  versions: string[],
  specifier: string,
): string | null => {
  const satisfying = versions
    .filter((v) => satisfiesRange(v, specifier))
    .sort(compareVersions)

  return satisfying.length > 0 ? satisfying[satisfying.length - 1] : null
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

    const data: Map<string, ProjectDependencySchema> = new Map()
    const directDependencies: Set<string> = new Set()

    // Helper to add or update a dependency
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
        const sources = existing.versions[resolvedVersion] || {}
        sources[source] = specifier
        existing.versions[resolvedVersion] = sources
      } else {
        data.set(id, {
          id,
          name,
          ecosystem,
          versions: { [resolvedVersion]: { [source]: specifier } },
        })
      }
    }

    data.set('npm:pnpm', {
      id: 'npm:pnpm',
      name: 'pnpm',
      ecosystem: 'system',
      versions: {},
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

    return Array.from(data.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    )
  },

  outdatedDependencies: async (
    project: DenvigProject,
  ): Promise<OutdatedDependencies> => {
    if (!existsSync(`${project.path}/pnpm-lock.yaml`)) {
      return {}
    }

    const result: OutdatedDependencies = {}

    // Parse the lockfile to get current versions
    const lockfilePath = `${project.path}/pnpm-lock.yaml`
    const lockfileContent = readFileSync(lockfilePath, 'utf-8')
    const lockfile = parse(lockfileContent) as PnpmLockfile

    // Collect all direct dependencies with their current versions and specifiers
    type DepInfo = {
      current: string
      specifier: string
      isDevDependency: boolean
    }
    const directDeps: Map<string, DepInfo> = new Map()

    if (lockfile?.importers) {
      for (const importer of Object.values(lockfile.importers)) {
        // Process dependencies
        if (importer.dependencies) {
          for (const [name, depInfo] of Object.entries(importer.dependencies)) {
            if (depInfo?.specifier && depInfo?.version) {
              // Only track if not already tracked (first occurrence wins)
              if (!directDeps.has(name)) {
                directDeps.set(name, {
                  current: stripPeerDeps(depInfo.version),
                  specifier: depInfo.specifier,
                  isDevDependency: false,
                })
              }
            }
          }
        }

        // Process devDependencies
        if (importer.devDependencies) {
          for (const [name, depInfo] of Object.entries(
            importer.devDependencies,
          )) {
            if (depInfo?.specifier && depInfo?.version) {
              if (!directDeps.has(name)) {
                directDeps.set(name, {
                  current: stripPeerDeps(depInfo.version),
                  specifier: depInfo.specifier,
                  isDevDependency: true,
                })
              }
            }
          }
        }
      }
    }

    // Fetch latest versions from npm registry for each dependency
    const fetchPromises = Array.from(directDeps.entries()).map(
      async ([name, info]) => {
        const npmInfo = await fetchNpmPackageInfo(name)
        if (!npmInfo) return

        const wanted = findWantedVersion(npmInfo.versions, info.specifier)
        const latest = npmInfo.latest

        // Only include if there's an update available
        const hasWantedUpdate = wanted && wanted !== info.current
        const hasLatestUpdate = latest && latest !== info.current

        if (hasWantedUpdate || hasLatestUpdate) {
          result[name] = {
            current: info.current,
            wanted: wanted || info.current,
            latest: latest,
            specifier: info.specifier,
            isDevDependency: info.isDevDependency,
          }
        }
      },
    )

    await Promise.all(fetchPromises)

    return result
  },
})

export default plugin
