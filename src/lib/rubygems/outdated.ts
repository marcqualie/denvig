import { fetchRubygemInfo } from './info.ts'

import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../dependencies.ts'
import type { OutdatedDependenciesOptions } from '../plugin.ts'

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
  const match = version.match(/^(\d+)\.(\d+)(?:\.(\d+))?(?:-(.+)|\.(.+))?$/)
  if (!match) return null
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: match[3] ? Number.parseInt(match[3], 10) : 0,
    prerelease: match[4] || match[5] || '',
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
 * Check if a version satisfies a RubyGems version specifier.
 * Supports: ~> x.y.z (pessimistic), >= x.y.z, > x.y.z, = x.y.z, < x.y.z, <= x.y.z
 */
const satisfiesRange = (version: string, specifier: string): boolean => {
  const v = parseVersion(version)
  if (!v) return false

  // Skip prerelease versions for compatibility checks
  if (v.prerelease) return false

  // Handle wildcard
  if (specifier === '*') return true

  // Normalize specifier - remove extra spaces
  const spec = specifier.trim()

  // Handle pessimistic version constraint (~>)
  if (spec.startsWith('~>')) {
    const baseStr = spec.slice(2).trim()
    const base = parseVersion(baseStr)
    if (!base) return false

    // ~> x.y.z means >= x.y.z and < x.(y+1).0
    // ~> x.y means >= x.y.0 and < (x+1).0.0
    const hasThreeComponents = baseStr.split('.').length >= 3

    if (hasThreeComponents) {
      // ~> 1.2.3 means >= 1.2.3, < 1.3.0
      return (
        v.major === base.major &&
        v.minor === base.minor &&
        v.patch >= base.patch
      )
    }
    // ~> 1.2 means >= 1.2.0, < 2.0.0
    return (
      v.major === base.major &&
      v.minor >= base.minor &&
      compareVersions(version, `${base.major}.${base.minor}.0`) >= 0
    )
  }

  // Handle >= range
  if (spec.startsWith('>=')) {
    return compareVersions(version, spec.slice(2).trim()) >= 0
  }

  // Handle > range (but not >=)
  if (spec.startsWith('>') && !spec.startsWith('>=')) {
    return compareVersions(version, spec.slice(1).trim()) > 0
  }

  // Handle <= range
  if (spec.startsWith('<=')) {
    return compareVersions(version, spec.slice(2).trim()) <= 0
  }

  // Handle < range (but not <=)
  if (spec.startsWith('<') && !spec.startsWith('<=')) {
    return compareVersions(version, spec.slice(1).trim()) < 0
  }

  // Handle = range (explicit exact)
  if (spec.startsWith('=')) {
    const baseStr = spec.slice(1).trim()
    const base = parseVersion(baseStr)
    if (!base) return false
    return (
      v.major === base.major && v.minor === base.minor && v.patch === base.patch
    )
  }

  // Exact version match (no operator)
  const base = parseVersion(spec)
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
 * Check rubygems packages for outdated versions.
 * Takes a list of dependencies and returns info about which are outdated.
 */
export const rubygemsOutdated = async (
  dependencies: ProjectDependencySchema[],
  options: OutdatedDependenciesOptions = {},
): Promise<OutdatedDependencySchema[]> => {
  const useCache = options.cache ?? true
  const result: OutdatedDependencySchema[] = []

  // Filter to only direct dependencies (those with sources, not transitive)
  const directDeps = dependencies.filter((dep) => {
    const sources = Object.values(dep.versions).flatMap((s) => Object.keys(s))
    // Direct deps have sources like ".#dependencies" or ".#devDependencies"
    // Transitive deps have sources like "Gemfile.lock:package@version"
    return sources.some(
      (s) => s.includes('#dependencies') || s.includes('#devDependencies'),
    )
  })

  const fetchPromises = directDeps.map(async (dep) => {
    const info = extractDepInfo(dep)
    if (!info) return

    const gemInfo = await fetchRubygemInfo(dep.name, !useCache)
    if (!gemInfo) return

    const wanted = findWantedVersion(gemInfo.versions, info.specifier)
    const latest = gemInfo.latest

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
