import { parse as parseYAML } from 'yaml'

import { optimiseVersions, type VersionMap } from './optimise.ts'

type Dependency = {
  versions: VersionMap
  optimisedVersions?: VersionMap
}

/**
 * Dependencies grouped by name and version.
 *
 * @example
 * ```
 * {
 *   dependencies: {
 *     react: {
 *       versions: {
 *        '16.13.1': ['^16.13.1', '^16.1.0'],
 *        '18.2.0': ['18.2.0'],
 *        '18.2.1': ['^18.2.1'],
 *       },
 *       optimisedVersions: {
 *        '16.13.1': ['^16.1.0', '^16.13.1'],
 *        '18.2.1': ['^18.2.0', '^18.2.1'],
 *       }
 *     }
 *   }
 * ```
 */
export type ParsedPnpmLock = {
  dependencies: Record<string, Dependency>
}

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
  importers?: Record<string, PnpmImporter>
  packages?: Record<string, unknown>
}

/**
 * Extract the resolved version from pnpm's version field.
 * Examples:
 * - "7.7.3" -> "7.7.3"
 * - "18.2.0(react@18.2.0)" -> "18.2.0"
 */
const extractResolvedVersion = (version: string): string => {
  const match = version.match(/^([^(]+)/)
  return match ? match[1] : version
}

/**
 * Parse pnpm-lock.yaml content for deduplication analysis.
 */
export const parsePnpmLockForDedupe = (content: string): ParsedPnpmLock => {
  const dependencies: Record<string, Dependency> = {}
  const lockfile = parseYAML(content) as PnpmLockfile

  if (!lockfile.importers) {
    return { dependencies }
  }

  for (const [_importerPath, importer] of Object.entries(lockfile.importers)) {
    const depTypes = [
      importer.dependencies,
      importer.devDependencies,
      importer.optionalDependencies,
    ]

    for (const deps of depTypes) {
      if (!deps) continue

      for (const [packageName, depEntry] of Object.entries(deps)) {
        const { specifier, version } = depEntry

        if (version.startsWith('link:')) {
          continue
        }

        const resolvedVersion = extractResolvedVersion(version)

        if (!dependencies[packageName]) {
          dependencies[packageName] = { versions: {} }
        }
        if (!dependencies[packageName].versions[resolvedVersion]) {
          dependencies[packageName].versions[resolvedVersion] = []
        }

        if (
          !dependencies[packageName].versions[resolvedVersion].includes(
            specifier,
          )
        ) {
          dependencies[packageName].versions[resolvedVersion].push(specifier)
        }

        dependencies[packageName].versions[resolvedVersion] = dependencies[
          packageName
        ].versions[resolvedVersion].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true }),
        )

        dependencies[packageName].versions = Object.fromEntries(
          Object.entries(dependencies[packageName].versions).sort((a, b) =>
            a[0].localeCompare(b[0], undefined, { numeric: true }),
          ),
        )
      }
    }
  }

  for (const [dependency, config] of Object.entries(dependencies)) {
    dependencies[dependency].optimisedVersions = optimiseVersions(
      config.versions,
    )
  }

  return { dependencies }
}
