import { fetchPyPIPackageInfo } from './info.ts'

import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../dependencies.ts'
import type { OutdatedDependenciesOptions } from '../plugin.ts'

/**
 * Parse a PEP 440 version string into components.
 */
const parseVersion = (
  version: string,
): {
  major: number
  minor: number
  patch: number
  prerelease: string
} | null => {
  // Handle versions like "1.0.0", "1.0", "1.0.0a1", "1.0.0.dev1", etc.
  const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:\.(\d+))?(.*)$/)
  if (!match) return null
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: match[3] ? Number.parseInt(match[3], 10) : 0,
    prerelease: match[5] || '',
  }
}

/**
 * Compare two PEP 440 versions.
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
 * Check if a version is a prerelease (contains a, b, rc, dev, etc.)
 */
const isPrerelease = (version: string): boolean => {
  return /[a-zA-Z]/.test(version)
}

/**
 * Check if a version satisfies a PEP 440 version specifier.
 * Supports: >=, >, ==, !=, <, <=, ~=, and wildcards (*)
 */
const satisfiesRange = (version: string, specifier: string): boolean => {
  const v = parseVersion(version)
  if (!v) return false

  // Skip prerelease versions unless explicitly requested
  if (isPrerelease(version)) return false

  // Handle wildcard
  if (specifier === '*') return true

  // Handle compatible release (~=)
  if (specifier.startsWith('~=')) {
    const baseStr = specifier.slice(2).trim()
    const base = parseVersion(baseStr)
    if (!base) return false

    // ~= X.Y means >= X.Y, == X.*
    // ~= X.Y.Z means >= X.Y.Z, == X.Y.*
    const parts = baseStr.split('.')
    if (parts.length >= 3) {
      // ~= 1.2.3 means >= 1.2.3, < 1.3.0
      return (
        v.major === base.major &&
        v.minor === base.minor &&
        v.patch >= base.patch
      )
    }
    // ~= 1.2 means >= 1.2.0, < 2.0.0
    return v.major === base.major && v.minor >= base.minor
  }

  // Handle >= range
  if (specifier.startsWith('>=')) {
    return compareVersions(version, specifier.slice(2).trim()) >= 0
  }

  // Handle > range (but not >=)
  if (specifier.startsWith('>') && !specifier.startsWith('>=')) {
    return compareVersions(version, specifier.slice(1).trim()) > 0
  }

  // Handle <= range
  if (specifier.startsWith('<=')) {
    return compareVersions(version, specifier.slice(2).trim()) <= 0
  }

  // Handle < range (but not <=)
  if (specifier.startsWith('<') && !specifier.startsWith('<=')) {
    return compareVersions(version, specifier.slice(1).trim()) < 0
  }

  // Handle != range
  if (specifier.startsWith('!=')) {
    return compareVersions(version, specifier.slice(2).trim()) !== 0
  }

  // Handle == range (exact match)
  if (specifier.startsWith('==')) {
    const baseStr = specifier.slice(2).trim()
    // Handle wildcards like ==1.0.*
    if (baseStr.endsWith('.*')) {
      const prefix = baseStr.slice(0, -2)
      return version.startsWith(prefix)
    }
    const base = parseVersion(baseStr)
    if (!base) return false
    return (
      v.major === base.major && v.minor === base.minor && v.patch === base.patch
    )
  }

  // Default: try exact match
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
  if (dep.versions.length === 0) return null

  const firstVersion = dep.versions[0]
  const isDevDependency = firstVersion.source.includes('#devDependencies')

  return {
    current: firstVersion.resolved,
    specifier: firstVersion.specifier,
    isDevDependency,
  }
}

/**
 * Check PyPI packages for outdated versions.
 * Takes a list of dependencies and returns info about which are outdated.
 */
export const uvOutdated = async (
  dependencies: ProjectDependencySchema[],
  options: OutdatedDependenciesOptions = {},
): Promise<OutdatedDependencySchema[]> => {
  const useCache = options.cache ?? true
  const result: OutdatedDependencySchema[] = []

  // Filter to only direct dependencies
  const directDeps = dependencies.filter((dep) => {
    return dep.versions.some(
      (v) =>
        v.source.includes('#dependencies') ||
        v.source.includes('#devDependencies'),
    )
  })

  const fetchPromises = directDeps.map(async (dep) => {
    const info = extractDepInfo(dep)
    if (!info) return

    const pypiInfo = await fetchPyPIPackageInfo(dep.name, !useCache)
    if (!pypiInfo) return

    const wanted = findWantedVersion(pypiInfo.versions, info.specifier)
    const latest = pypiInfo.latest

    // Only include if there's an update available
    const hasWantedUpdate = wanted && wanted !== info.current
    const hasLatestUpdate = latest && latest !== info.current

    if (hasWantedUpdate || hasLatestUpdate) {
      result.push({
        ...dep,
        wanted: wanted || info.current,
        latest: latest,
        specifier: info.specifier,
        isDevDependency: info.isDevDependency,
      })
    }
  })

  await Promise.all(fetchPromises)

  return result
}
