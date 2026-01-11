import { fetchNpmPackageInfo } from './info.ts'

import type { ProjectDependencySchema } from '../dependencies.ts'
import type {
  OutdatedDependencies,
  OutdatedDependenciesOptions,
} from '../plugin.ts'

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

/**
 * Extract dependency info from ProjectDependencySchema versions.
 * Returns the current version, specifier, and whether it's a dev dependency.
 */
const extractDepInfo = (
  dep: Pick<ProjectDependencySchema, 'versions'>,
): { current: string; specifier: string; isDevDependency: boolean } | null => {
  // Get the first version entry (there should typically be one for direct deps)
  const versionEntries = Object.entries(dep.versions)
  if (versionEntries.length === 0) return null

  // Use the first version as current
  const [current, sources] = versionEntries[0]

  // Get the first source to determine specifier and dev status
  const sourceEntries = Object.entries(sources)
  if (sourceEntries.length === 0) return null

  const [source, specifier] = sourceEntries[0]
  const isDevDependency = source.includes('#devDependencies')

  return { current, specifier, isDevDependency }
}

/**
 * Check npm packages for outdated versions.
 * Takes a list of dependencies and returns info about which are outdated.
 */
export const npmOutdated = async (
  dependencies: Array<Pick<ProjectDependencySchema, 'name' | 'versions'>>,
  options: OutdatedDependenciesOptions = {},
): Promise<OutdatedDependencies> => {
  const useCache = options.cache ?? true
  const result: OutdatedDependencies = {}

  // Filter to only direct dependencies (those with sources, not transitive)
  const directDeps = dependencies.filter((dep) => {
    const sources = Object.values(dep.versions).flatMap((s) => Object.keys(s))
    // Direct deps have sources like ".#dependencies" or "packages/foo#dependencies"
    // Transitive deps have sources like "pnpm-lock.yaml:package@version"
    return sources.some(
      (s) => s.includes('#dependencies') || s.includes('#devDependencies'),
    )
  })

  const fetchPromises = directDeps.map(async (dep) => {
    const info = extractDepInfo(dep)
    if (!info) return

    const npmInfo = await fetchNpmPackageInfo(dep.name, !useCache)
    if (!npmInfo) return

    const wanted = findWantedVersion(npmInfo.versions, info.specifier)
    const latest = npmInfo.latest

    // Only include if there's an update available
    const hasWantedUpdate = wanted && wanted !== info.current
    const hasLatestUpdate = latest && latest !== info.current

    if (hasWantedUpdate || hasLatestUpdate) {
      result[dep.name] = {
        current: info.current,
        wanted: wanted || info.current,
        latest: latest,
        specifier: info.specifier,
        isDevDependency: info.isDevDependency,
      }
    }
  })

  await Promise.all(fetchPromises)

  return result
}
