import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

import { npmOutdated } from '../lib/npm/outdated.ts'
import { readPackageJson } from '../lib/packageJson.ts'
import { parseYarnLockContent } from '../lib/parsers/yarn.ts'
import { definePlugin } from '../lib/plugin.ts'
import { pathExists } from '../lib/safeReadFile.ts'

import type { ProjectDependencySchema } from '../lib/dependencies.ts'
import type { DenvigProject } from '../lib/project.ts'

// Cache for parsed dependencies by project path
const dependenciesCache = new Map<string, ProjectDependencySchema[]>()

/**
 * Yarn Berry (v2+) lockfile entry
 */
type YarnBerryLockEntry = {
  version: string
  resolution: string
  dependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/**
 * Yarn Berry lockfile structure
 */
type YarnBerryLockfile = {
  __metadata?: { version: number }
} & Record<string, YarnBerryLockEntry>

/**
 * Check if lockfile is yarn berry format (YAML with __metadata)
 */
function isYarnBerryLockfile(content: string): boolean {
  return content.includes('__metadata:')
}

/**
 * Extract package name from a berry lockfile key
 * e.g., "@types/node@npm:^18.0.0" -> "@types/node"
 */
function extractPackageName(key: string): string {
  const npmMatch = key.match(/^(.+)@npm:/)
  if (npmMatch) {
    return npmMatch[1]
  }

  const lastAtIndex = key.lastIndexOf('@')
  if (lastAtIndex > 0) {
    return key.slice(0, lastAtIndex)
  }

  return key
}

const plugin = definePlugin({
  name: 'yarn',

  actions: async (project: DenvigProject) => {
    const hasPackageJson = project.rootFiles.includes('package.json')
    const hasYarnLock = project.rootFiles.includes('yarn.lock')
    const canHandle = hasPackageJson && hasYarnLock

    if (!canHandle) {
      return {}
    }

    const packageJson = await readPackageJson(project)
    const scripts = packageJson?.scripts || ({} as Record<string, string>)
    const actions: Record<string, string[]> = {
      ...Object.entries(scripts)
        .map(([key, _script]) => [key, `yarn run ${key}`])
        .reduce(
          (acc, [key, script]) => {
            acc[key] = [script]
            return acc
          },
          {} as Record<string, string[]>,
        ),
      install: ['yarn install'],
      outdated: ['yarn outdated'],
    }

    return actions
  },

  dependencies: async (
    project: DenvigProject,
  ): Promise<ProjectDependencySchema[]> => {
    const lockfilePath = `${project.path}/yarn.lock`
    const packageJsonPath = `${project.path}/package.json`

    if (
      !(await pathExists(lockfilePath)) ||
      !(await pathExists(packageJsonPath))
    ) {
      return []
    }

    // Return cached result if available
    const cached = dependenciesCache.get(project.path)
    if (cached) {
      return cached
    }

    const data: Map<string, ProjectDependencySchema> = new Map()
    const directDependencies: Set<string> = new Set()

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

    // Add yarn as system dependency
    data.set('npm:yarn', {
      id: 'npm:yarn',
      name: 'yarn',
      ecosystem: 'system',
      versions: [],
    })

    // Read and parse lockfile
    const lockfileContent = await readFile(lockfilePath, 'utf-8')
    const isBerry = isYarnBerryLockfile(lockfileContent)

    // Build a map of name -> resolved versions from lockfile
    // Structure: Map<name, Map<specifier, resolvedVersion>>
    const resolvedVersionsByName: Map<string, Map<string, string>> = new Map()
    // Build a map of package@version -> dependencies for transitive deps (berry only)
    const packageDeps: Map<string, Record<string, string>> = new Map()

    // Parsed lockfile data (for classic format)
    let parsedLockfile: ReturnType<typeof parseYarnLockContent> | null = null

    if (isBerry) {
      // Parse yarn berry lockfile (YAML)
      const lockfile = parse(lockfileContent) as YarnBerryLockfile
      for (const [key, entry] of Object.entries(lockfile)) {
        if (key === '__metadata' || !entry?.version) continue
        if (typeof entry.version !== 'string') continue

        const name = extractPackageName(key)
        const typedEntry = entry as YarnBerryLockEntry

        // Store version mapping
        if (!resolvedVersionsByName.has(name)) {
          resolvedVersionsByName.set(name, new Map())
        }
        // Extract specifier from key (e.g., "@types/node@npm:^18.0.0" -> "^18.0.0")
        const specifierMatch = key.match(/@npm:(.+)$/)
        if (specifierMatch) {
          resolvedVersionsByName
            .get(name)
            ?.set(specifierMatch[1], entry.version)
        }

        // Store dependencies for transitive resolution
        if (typedEntry.dependencies) {
          packageDeps.set(
            `${name}@${typedEntry.version}`,
            typedEntry.dependencies,
          )
        }
      }
    } else {
      // Parse yarn classic lockfile using the parser
      parsedLockfile = parseYarnLockContent(lockfileContent)

      for (const [name, dep] of Object.entries(parsedLockfile.dependencies)) {
        if (!resolvedVersionsByName.has(name)) {
          resolvedVersionsByName.set(name, new Map())
        }

        // Map each specifier to its resolved version
        for (const [resolvedVersion, sources] of Object.entries(dep.versions)) {
          // Get specifier from yarn.lock source (the main lockfile entry)
          const lockfileSpecifier = sources['yarn.lock']
          if (lockfileSpecifier) {
            resolvedVersionsByName
              .get(name)
              ?.set(lockfileSpecifier, resolvedVersion)
          }
        }
      }
    }

    // Find all package.json files (root + workspaces)
    const packageJsonFiles = [packageJsonPath]
    const workspacePackageJsons = await project.findFilesByName('package.json')
    packageJsonFiles.push(...workspacePackageJsons)

    // Process each package.json
    for (const pkgJsonPath of packageJsonFiles) {
      try {
        const pkgContent = await readFile(pkgJsonPath, 'utf-8')
        const pkg = JSON.parse(pkgContent) as {
          dependencies?: Record<string, string>
          devDependencies?: Record<string, string>
        }

        // Determine base source path (relative to project root)
        let basePath = '.'
        if (pkgJsonPath !== packageJsonPath) {
          basePath = pkgJsonPath
            .replace(`${project.path}/`, '')
            .replace('/package.json', '')
        }

        // Helper to process a dependency group
        const processDeps = (
          deps: Record<string, string> | undefined,
          section: 'dependencies' | 'devDependencies',
        ) => {
          if (!deps) return

          for (const [name, specifier] of Object.entries(deps)) {
            directDependencies.add(name)

            // Find resolved version from lockfile
            const versionMap = resolvedVersionsByName.get(name)
            let resolvedVersion = specifier

            if (versionMap) {
              // Try exact specifier match first
              const exactMatch = versionMap.get(specifier)
              if (exactMatch) {
                resolvedVersion = exactMatch
              } else {
                // Fall back to first available resolved version
                const firstVersion = versionMap.values().next().value
                if (firstVersion) {
                  resolvedVersion = firstVersion
                }
              }
            }

            addDependency(
              `npm:${name}`,
              name,
              'npm',
              resolvedVersion,
              `${basePath}#${section}`,
              specifier,
            )
          }
        }

        processDeps(pkg.dependencies, 'dependencies')
        processDeps(pkg.devDependencies, 'devDependencies')
      } catch {
        // Skip invalid package.json files
      }
    }

    // Add transitive dependencies
    if (isBerry) {
      // Berry format: use packageDeps
      for (const [pkgKey, deps] of packageDeps.entries()) {
        for (const [depName, depSpecifier] of Object.entries(deps)) {
          if (!directDependencies.has(depName)) {
            // Find resolved version
            const versionMap = resolvedVersionsByName.get(depName)
            let resolvedVersion = depSpecifier

            if (versionMap) {
              const exactMatch = versionMap.get(depSpecifier)
              if (exactMatch) {
                resolvedVersion = exactMatch
              } else {
                const firstVersion = versionMap.values().next().value
                if (firstVersion) {
                  resolvedVersion = firstVersion
                }
              }
            }

            const source = `yarn.lock:${pkgKey}`
            addDependency(
              `npm:${depName}`,
              depName,
              'npm',
              resolvedVersion,
              source,
              depSpecifier,
            )
          }
        }
      }
    } else if (parsedLockfile) {
      // Classic format: use parsed lockfile with source tracking
      for (const [name, dep] of Object.entries(parsedLockfile.dependencies)) {
        // Skip direct dependencies - they've already been added with package.json source
        if (directDependencies.has(name)) continue

        for (const [resolvedVersion, sources] of Object.entries(dep.versions)) {
          for (const [source, specifier] of Object.entries(sources)) {
            // Only add transitive deps (yarn.lock:parent@version sources)
            if (source.startsWith('yarn.lock:')) {
              addDependency(
                `npm:${name}`,
                name,
                'npm',
                resolvedVersion,
                source,
                specifier,
              )
            }
          }
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
    if (!(await pathExists(`${project.path}/yarn.lock`))) {
      return []
    }
    const dependencies = await plugin.dependencies?.(project)
    if (!dependencies) return []
    return npmOutdated(dependencies, options)
  },
})

export default plugin
