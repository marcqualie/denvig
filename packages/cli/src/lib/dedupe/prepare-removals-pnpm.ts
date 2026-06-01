import { parse as parseYAML } from 'yaml'

type PnpmDependencyEntry = {
  specifier: string
  version: string
}

type PnpmImporter = {
  dependencies?: Record<string, PnpmDependencyEntry>
  devDependencies?: Record<string, PnpmDependencyEntry>
  optionalDependencies?: Record<string, PnpmDependencyEntry>
}

type PnpmLockfile = {
  lockfileVersion?: string
  settings?: Record<string, unknown>
  importers?: Record<string, PnpmImporter>
  packages?: Record<string, unknown>
  snapshots?: Record<string, unknown>
}

const escapeRegex = (str: string): string => {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Extract the resolved version from pnpm's version field.
 */
const extractResolvedVersion = (version: string): string => {
  const match = version.match(/^([^(]+)/)
  return match ? match[1] : version
}

/**
 * Find the optimised version for a given specifier.
 */
const findOptimisedVersion = (
  specifier: string,
  optimised: Record<string, string[]>,
): string | null => {
  for (const [version, specifiers] of Object.entries(optimised)) {
    if (specifiers.includes(specifier)) {
      return version
    }
  }
  return null
}

/**
 * Remove a package block from the pnpm-lock.yaml source.
 */
const removePackageBlock = (source: string, packageKey: string): string => {
  const escapedKey = escapeRegex(packageKey)
  const blockRegex = new RegExp(
    `^  '?${escapedKey}'?:.*\\n(?:    .*\\n)*\\n?`,
    'gm',
  )
  return source.replace(blockRegex, '')
}

/**
 * Remove deduplicated dependencies from pnpm-lock.yaml source and
 * update version references to point to the optimised versions.
 */
export const preparePnpmRemovals = (
  source: string,
  removals: Record<string, string[]>,
  optimisedVersions?: Record<string, Record<string, string[]>>,
): string => {
  const lockfile = parseYAML(source) as PnpmLockfile
  let result = source

  // Build a map of version updates for importers
  const versionUpdates: Record<string, string> = {}
  if (lockfile.importers && optimisedVersions) {
    for (const importer of Object.values(lockfile.importers)) {
      const depTypes = [
        importer.dependencies,
        importer.devDependencies,
        importer.optionalDependencies,
      ]

      for (const deps of depTypes) {
        if (!deps) continue

        for (const [packageName, depEntry] of Object.entries(deps)) {
          const currentVersion = depEntry.version
          const { specifier } = depEntry

          if (currentVersion.startsWith('link:')) continue

          const extractedVersion = extractResolvedVersion(currentVersion)

          if (removals[packageName]?.includes(extractedVersion)) {
            const optimised = optimisedVersions[packageName]
            if (optimised) {
              const newVersion = findOptimisedVersion(specifier, optimised)
              if (newVersion && newVersion !== extractedVersion) {
                versionUpdates[currentVersion] = currentVersion.includes('(')
                  ? currentVersion.replace(/^[^(]+/, newVersion)
                  : newVersion
              }
            }
          }
        }
      }
    }
  }

  // Update version references in importers section
  for (const [oldVersion, newVersion] of Object.entries(versionUpdates)) {
    const versionLineRegex = new RegExp(
      `^(\\s+version: )${escapeRegex(oldVersion)}$`,
      'gm',
    )
    result = result.replace(versionLineRegex, `$1${newVersion}`)
  }

  // Remove package entries from packages and snapshots sections
  for (const [packageName, versions] of Object.entries(removals)) {
    for (const version of versions) {
      const packageKey = `${packageName}@${version}`
      result = removePackageBlock(result, packageKey)
      result = removePackageBlock(result, packageKey)
    }
  }

  return result
}
