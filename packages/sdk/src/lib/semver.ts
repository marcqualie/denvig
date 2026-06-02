import semver from 'semver'

export type SemverLevel = 'major' | 'minor' | 'patch'
export type SemverFilter = 'patch' | 'minor' | 'major'

/**
 * Get the semver update level between two versions using the semver package.
 * Returns 'major', 'minor', 'patch', or null if versions match or can't be parsed.
 */
export const getSemverLevel = (
  current: string,
  target: string,
): SemverLevel | null => {
  if (current === target) return null

  try {
    const diff = semver.diff(current, target)
    if (!diff) return null

    // Map semver diff types to our simplified levels
    if (diff === 'major' || diff === 'premajor') {
      return 'major'
    }
    if (diff === 'minor' || diff === 'preminor') {
      return 'minor'
    }
    if (diff === 'patch' || diff === 'prepatch' || diff === 'prerelease') {
      return 'patch'
    }

    return null
  } catch {
    return null
  }
}

/**
 * Check if a semver level matches the filter.
 * - 'patch': only patch updates match
 * - 'minor': minor and patch updates match
 * - 'major': only major updates match
 */
export const matchesSemverFilter = (
  level: SemverLevel | null,
  filter: SemverFilter,
): boolean => {
  if (level === null) return false
  if (filter === 'patch') return level === 'patch'
  if (filter === 'minor') return level === 'patch' || level === 'minor'
  if (filter === 'major') return level === 'major'
  return false
}

export type DependencyWithVersions = {
  name: string
  currentVersion: string
  latestVersion: string
}

/**
 * Filter a list of dependencies by semver level.
 * Compares current version to latest version to determine the update level.
 */
export const filterDependenciesBySemver = <T extends DependencyWithVersions>(
  dependencies: T[],
  filter: SemverFilter,
): T[] => {
  return dependencies.filter((dep) => {
    const level = getSemverLevel(dep.currentVersion, dep.latestVersion)
    return matchesSemverFilter(level, filter)
  })
}

export type OutdatedDependencyVersions = {
  currentVersion: string
  wantedVersion: string
  latestVersion: string
}

/**
 * Check if an outdated dependency matches a semver filter.
 *
 * A dependency matches when either `wanted` or `latest` represents an update
 * at the requested level. This ensures a patch update (e.g., `0.27.7`) is
 * still detected when a higher minor/major version (e.g., `0.28.0`) exists
 * alongside it — previously the filter only compared against `latest`, so the
 * patch would be hidden behind the minor bump.
 */
export const outdatedMatchesSemverFilter = (
  dep: OutdatedDependencyVersions,
  filter: SemverFilter,
): boolean => {
  const wantedLevel = getSemverLevel(dep.currentVersion, dep.wantedVersion)
  if (matchesSemverFilter(wantedLevel, filter)) return true
  const latestLevel = getSemverLevel(dep.currentVersion, dep.latestVersion)
  return matchesSemverFilter(latestLevel, filter)
}
