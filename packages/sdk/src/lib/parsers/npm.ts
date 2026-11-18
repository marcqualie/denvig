import type { ProjectDependencySchema } from '../dependencies.ts'

/**
 * An entry in the `packages` map of a v2/v3 `package-lock.json`. The key is
 * the install location (`""` for the root, `node_modules/foo` for installed
 * packages, `packages/web` for workspace packages).
 */
export type NpmLockPackage = {
  name?: string
  version?: string
  link?: boolean
  resolved?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
}

/**
 * An entry in the nested `dependencies` tree of a v1 `package-lock.json`.
 */
type NpmLockV1Dependency = {
  version?: string
  requires?: Record<string, string>
  dependencies?: Record<string, NpmLockV1Dependency>
}

export type NpmLockfile = {
  lockfileVersion?: number
  packages?: Record<string, NpmLockPackage>
  dependencies?: Record<string, NpmLockV1Dependency>
}

/**
 * Direct dependency ranges declared by the root `package.json`. Only needed
 * for v1 lockfiles, which do not record them.
 */
export type NpmRootManifest = {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
}

const NODE_MODULES = 'node_modules/'

/**
 * Read the package name from an install location.
 *
 * @example
 * nameFromLocation('node_modules/a/node_modules/@scope/b') // '@scope/b'
 */
const nameFromLocation = (location: string): string => {
  const index = location.lastIndexOf(NODE_MODULES)
  return index === -1 ? location : location.slice(index + NODE_MODULES.length)
}

/**
 * Split a v1 alias version (`npm:real-name@1.2.3`) into its parts.
 */
const parseV1Alias = (
  version: string,
): { name: string; version: string } | null => {
  const match = version.match(/^npm:((?:@[^@/]+\/)?[^@]+)@(.+)$/)
  return match ? { name: match[1], version: match[2] } : null
}

/**
 * Convert the nested v1 `dependencies` tree into the flat v2 `packages` map
 * so both formats share one resolver.
 */
const normalizeV1 = (
  lockfile: NpmLockfile,
  rootManifest: NpmRootManifest | null,
): Record<string, NpmLockPackage> => {
  const packages: Record<string, NpmLockPackage> = {
    '': {
      dependencies: rootManifest?.dependencies,
      devDependencies: rootManifest?.devDependencies,
      optionalDependencies: rootManifest?.optionalDependencies,
    },
  }

  const walk = (
    deps: Record<string, NpmLockV1Dependency>,
    prefix: string,
  ): void => {
    for (const [name, dep] of Object.entries(deps)) {
      const location = `${prefix}${NODE_MODULES}${name}`
      const alias = dep.version ? parseV1Alias(dep.version) : null
      packages[location] = {
        name: alias?.name,
        version: alias?.version ?? dep.version,
        dependencies: dep.requires,
      }
      if (dep.dependencies) walk(dep.dependencies, `${location}/`)
    }
  }
  walk(lockfile.dependencies ?? {}, '')

  return packages
}

/**
 * Parse a `package-lock.json` into denvig dependencies.
 *
 * Direct dependencies use `<path>#dependencies` / `<path>#devDependencies`
 * sources, where `<path>` is `.` for the root package or the workspace
 * directory. Transitive dependencies use `package-lock.json:<parent>@<version>`
 * sources, matching the other lockfile parsers.
 */
export const parseNpmLockfile = (
  lockfile: NpmLockfile,
  rootManifest: NpmRootManifest | null = null,
): ProjectDependencySchema[] => {
  const packages = lockfile.packages ?? normalizeV1(lockfile, rootManifest)
  const data = new Map<string, ProjectDependencySchema>()
  const seen = new Set<string>()

  const addDependency = (
    name: string,
    resolved: string,
    source: string,
    specifier: string,
  ): void => {
    const id = `npm:${name}`
    const key = `${id}@${resolved}@${source}`
    if (seen.has(key)) return
    seen.add(key)
    const existing = data.get(id)
    if (existing) {
      existing.versions.push({ resolved, specifier, source })
    } else {
      data.set(id, {
        id,
        name,
        ecosystem: 'npm',
        versions: [{ resolved, specifier, source }],
      })
    }
  }

  /**
   * Resolve a dependency the way Node does: look in the nearest
   * `node_modules` folder, then walk up towards the root. Workspace links
   * are followed to the workspace package they point at.
   */
  const resolve = (
    from: string,
    depName: string,
  ): { name: string; version: string } | null => {
    let base = from
    while (true) {
      const location = base
        ? `${base}/${NODE_MODULES}${depName}`
        : `${NODE_MODULES}${depName}`
      const entry = packages[location]
      if (entry) {
        const target =
          entry.link && entry.resolved ? packages[entry.resolved] : entry
        if (!target?.version) return null
        return {
          name: entry.link ? depName : (entry.name ?? depName),
          version: target.version,
        }
      }
      if (!base) return null
      const index = base.lastIndexOf(`/${NODE_MODULES}`)
      base = index === -1 ? '' : base.slice(0, index)
    }
  }

  for (const [location, entry] of Object.entries(packages)) {
    if (entry.link) continue

    const isInstalled = location.includes(NODE_MODULES)
    if (!isInstalled) {
      const basePath = location === '' ? '.' : location
      const groups: [Record<string, string> | undefined, string][] = [
        [entry.dependencies, `${basePath}#dependencies`],
        [entry.optionalDependencies, `${basePath}#dependencies`],
        [entry.devDependencies, `${basePath}#devDependencies`],
      ]
      for (const [deps, source] of groups) {
        for (const [depName, specifier] of Object.entries(deps ?? {})) {
          const resolved = resolve(location, depName)
          if (!resolved) continue
          addDependency(resolved.name, resolved.version, source, specifier)
        }
      }
      continue
    }

    if (!entry.version) continue
    const parentName = entry.name ?? nameFromLocation(location)
    const source = `package-lock.json:${parentName}@${entry.version}`
    const transitive = {
      ...entry.peerDependencies,
      ...entry.optionalDependencies,
      ...entry.dependencies,
    }
    for (const [depName, specifier] of Object.entries(transitive)) {
      const resolved = resolve(location, depName)
      if (!resolved) continue
      addDependency(resolved.name, resolved.version, source, specifier)
    }
  }

  return Array.from(data.values()).sort((a, b) => a.name.localeCompare(b.name))
}
