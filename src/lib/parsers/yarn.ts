/** Resolved version - 1.2.3 */
type Version = string

/** Version or range to be resolved - ^1.2.3 */
type Specifier = string

/** Source of the dependency constraint (package.json path or lockfile reference) */
type Source = string

/**
 * A map of versions where the resolved version is the key and the values
 * map sources to their specifiers
 */
export type VersionMap = Record<Version, Record<Source, Specifier>>

interface Dependency {
  versions: VersionMap
}

/**
 * Dependencies grouped by name and version, with source tracking
 *
 * @example
 * ```
 * {
 *   dependencies: {
 *     react: {
 *       versions: {
 *        '18.2.0': {
 *          '.': '^18.2.0',  // From root package.json
 *          'packages/app': '^18.0.0',  // From workspace package.json
 *        },
 *        '16.13.1': {
 *          'yarn.lock:some-legacy-pkg@1.0.0': '^16.0.0',  // Transitive dep
 *        }
 *       }
 *     }
 *   }
 * }
 * ```
 */
export interface ParsedYarnLock {
  dependencies: Record<string, Dependency>
}

interface ParsedNativeDependency {
  version: string
  resolved: string
  integrity?: string
  dependencies?: Record<string, string>
}

/**
 * Native format used by Yarn parser.
 * https://github.com/yarnpkg/yarn/tree/master/packages/lockfile
 */
interface ParsedNativeLockfile {
  type: string
  object: Record<string, ParsedNativeDependency>
}

/**
 * Mimic the native parsing of the yarn.lock file.
 * The official library has not been updated in 6+ years and requires Buffer which is not available.
 */
export const nativeParse = (content: string): ParsedNativeLockfile => {
  const blocks = content.split('\n\n')
  const dependencies: Record<string, ParsedNativeDependency> = {}

  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 3) continue

    const definitions = lines[0]
      .split(',')
      .map((definition) => definition.trim().replace(/"|:/g, ''))
    const version = lines[1]?.match(/version "(.+)"/)?.[1]
    const resolved = lines[2]?.match(/resolved "(.+)"/)?.[1]
    if (!version || !resolved) continue

    // Parse dependencies section if present
    const deps: Record<string, string> = {}
    let inDepsSection = false
    for (let i = 3; i < lines.length; i++) {
      const line = lines[i]
      if (line.trim() === 'dependencies:') {
        inDepsSection = true
        continue
      }
      if (inDepsSection && line.startsWith('    ')) {
        // Parse dependency line like:    "loose-envify" "^1.1.0"
        const depMatch = line.trim().match(/^"?([^"\s]+)"?\s+"?([^"]+)"?$/)
        if (depMatch) {
          deps[depMatch[1]] = depMatch[2]
        }
      } else if (inDepsSection && !line.startsWith('    ')) {
        // End of dependencies section
        inDepsSection = false
      }
    }

    for (const definition of definitions) {
      if (!definition) continue
      dependencies[definition] = {
        version,
        resolved,
        dependencies: Object.keys(deps).length > 0 ? deps : undefined,
      }
    }
  }

  return {
    type: 'success',
    object: dependencies,
  }
}

/**
 * Parse yarn.lock file to get all dependency versions with source tracking.
 */
export const parseYarnLockContent = (content: string): ParsedYarnLock => {
  const dependencies: Record<string, Dependency> = {}
  const nativeParsed = nativeParse(content)

  // First pass: collect all version mappings and dependencies
  const versionsByName: Map<
    string,
    Array<{ version: string; specifier: string; deps?: Record<string, string> }>
  > = new Map()

  for (const [dependencyDefinition, dependencyConfig] of Object.entries(
    nativeParsed.object,
  )) {
    const pattern = /^(@?.+)@(.+)$/
    const [, dependencyName, specifier] =
      dependencyDefinition.match(pattern) || []

    if (!dependencyName) continue

    if (!versionsByName.has(dependencyName)) {
      versionsByName.set(dependencyName, [])
    }

    versionsByName.get(dependencyName)?.push({
      version: dependencyConfig.version,
      specifier,
      deps: dependencyConfig.dependencies,
    })
  }

  // Second pass: build dependencies with sources
  // Direct dependencies get 'yarn.lock' as source (to be overridden by plugin with package.json path)
  // Transitive dependencies get 'yarn.lock:parent@version' as source
  for (const [name, entries] of versionsByName.entries()) {
    if (!dependencies[name]) {
      dependencies[name] = { versions: {} }
    }

    for (const entry of entries) {
      if (!dependencies[name].versions[entry.version]) {
        dependencies[name].versions[entry.version] = {}
      }

      // Use 'yarn.lock' as the source - plugin will override with package.json path for direct deps
      dependencies[name].versions[entry.version]['yarn.lock'] = entry.specifier
    }

    // Sort versions numerically
    dependencies[name].versions = Object.fromEntries(
      Object.entries(dependencies[name].versions).sort((a, b) =>
        a[0].localeCompare(b[0], undefined, { numeric: true }),
      ),
    )
  }

  // Third pass: add transitive dependencies with parent as source
  for (const [name, entries] of versionsByName.entries()) {
    for (const entry of entries) {
      if (!entry.deps) continue

      const parentKey = `${name}@${entry.version}`

      for (const [depName, depSpecifier] of Object.entries(entry.deps)) {
        if (!dependencies[depName]) {
          dependencies[depName] = { versions: {} }
        }

        // Find the resolved version for this transitive dep
        const depEntries = versionsByName.get(depName)
        if (!depEntries) continue

        // Find matching version for this specifier
        const matchingEntry = depEntries.find(
          (e) => e.specifier === depSpecifier,
        )
        const resolvedVersion = matchingEntry?.version || depEntries[0]?.version

        if (resolvedVersion) {
          if (!dependencies[depName].versions[resolvedVersion]) {
            dependencies[depName].versions[resolvedVersion] = {}
          }

          const source = `yarn.lock:${parentKey}`
          dependencies[depName].versions[resolvedVersion][source] = depSpecifier
        }
      }
    }
  }

  return {
    dependencies,
  }
}
