import { satisfies } from 'semver'

/** Resolved version - 1.2.3 */
type Version = string

/** Version or range to be resolved - ^1.2.3 */
type TargetVersion = string

/**
 * A map of versions where the resolved version is the key and the values
 * are all target versions that are compatible
 */
export type VersionMap = Record<Version, TargetVersion[]>

/**
 * Find the highest version from a list that satisfies the given target range.
 * Falls back to the last version in the list if no match is found.
 */
export const highestVersionCompatible = (
  target: string,
  versions: string[],
): string => {
  let highestVersion = '0.0.0'

  for (const version of versions) {
    const compatible = satisfies(version, target)
    if (compatible) {
      highestVersion = version
    }
  }

  // Fallback for when checks fail
  if (highestVersion === '0.0.0') {
    return versions[versions.length - 1]
  }

  return highestVersion
}

/**
 * Given a version map (resolved version -> target specifiers[]),
 * compute an optimised version map that combines compatible specifiers
 * onto their highest compatible resolved version.
 */
export const optimiseVersions = (
  originalVersionMap: VersionMap,
): VersionMap => {
  const versionKeys = Object.keys(originalVersionMap)
  const targetKeys = Object.values(originalVersionMap).flat()
  const versions: VersionMap = {}

  for (const target of targetKeys) {
    const highest = highestVersionCompatible(target, versionKeys)
    if (!versions[highest]) {
      versions[highest] = []
    }
    versions[highest].push(target)
  }

  return versions
}
