import { Command } from '../../lib/command.ts'

import type { ProjectDependencySchema } from '../../lib/dependencies.ts'

/**
 * Strip peer dependency qualifiers from version strings.
 * e.g., "tsup@8.5.0(typescript@5.9.3)" -> "tsup@8.5.0"
 */
const stripPeerDeps = (ref: string): string => {
  const parenIndex = ref.indexOf('(')
  return parenIndex === -1 ? ref : ref.slice(0, parenIndex)
}

/**
 * Lockfile source prefixes for different package managers.
 * Sources starting with these are transitive dependencies.
 */
const LOCKFILE_PREFIXES = [
  'pnpm-lock.yaml:',
  'yarn.lock:',
  'Gemfile.lock:',
  'uv.lock:',
]

/**
 * Check if a source is from a lockfile (transitive dependency).
 */
const isLockfileSource = (source: string): boolean => {
  return LOCKFILE_PREFIXES.some((prefix) => source.startsWith(prefix))
}

/**
 * Check if a source is from dependencies section.
 */
const isDependenciesSource = (source: string): boolean => {
  return source.endsWith('#dependencies')
}

/**
 * Check if a source is from devDependencies section.
 */
const isDevDependenciesSource = (source: string): boolean => {
  return source.endsWith('#devDependencies')
}

/**
 * Extract parent reference from a lockfile source.
 * e.g., "pnpm-lock.yaml:tsup@8.5.0" -> "tsup@8.5.0"
 * e.g., "yarn.lock:react@18.2.0" -> "react@18.2.0"
 */
const extractParentRef = (source: string): string => {
  for (const prefix of LOCKFILE_PREFIXES) {
    if (source.startsWith(prefix)) {
      return stripPeerDeps(source.slice(prefix.length))
    }
  }
  return source
}

export const depsListCommand = new Command({
  name: 'deps:list',
  description: 'List all dependencies detected by plugins',
  usage: 'deps:list [--depth <n>]',
  example: 'denvig deps:list --depth 2',
  args: [],
  flags: [
    {
      name: 'depth',
      description: 'Depth of transitive dependencies to show (default: 0)',
      required: false,
      type: 'number',
      defaultValue: 0,
    },
  ],
  handler: async ({ project, flags }) => {
    const maxDepth = (flags.depth as number) ?? 0
    const allDependencies = await project.dependencies()

    // Deduplicate dependencies by id
    const depsMap = new Map<string, ProjectDependencySchema>()
    for (const dep of allDependencies) {
      const existing = depsMap.get(dep.id)
      if (!existing) {
        depsMap.set(dep.id, dep)
      } else {
        // Merge versions records if the dependency already exists
        const mergedVersions: Record<string, Record<string, string>> = {
          ...existing.versions,
        }
        for (const [resolvedVersion, sources] of Object.entries(dep.versions)) {
          const existingSources = mergedVersions[resolvedVersion] || {}
          mergedVersions[resolvedVersion] = {
            ...existingSources,
            ...sources,
          }
        }
        depsMap.set(dep.id, { ...existing, versions: mergedVersions })
      }
    }

    const dependencies = Array.from(depsMap.values())

    if (dependencies.length === 0) {
      console.log('No dependencies detected in this project.')
      return { success: true, message: 'No dependencies detected.' }
    }

    console.log(`Dependencies for project: ${project.name}`)
    console.log('')

    // Build lookup maps
    const depsByName = new Map<string, ProjectDependencySchema>()
    for (const dep of dependencies) {
      depsByName.set(dep.name, dep)
    }

    // Find direct dependencies (sources not from lockfile)
    // Split into dependencies and devDependencies
    const depsSet = new Set<string>()
    const devDepsSet = new Set<string>()
    const prodDeps: Array<{ name: string; version: string }> = []
    const devDeps: Array<{ name: string; version: string }> = []

    for (const dep of dependencies) {
      for (const [version, sources] of Object.entries(dep.versions)) {
        for (const source of Object.keys(sources)) {
          if (!isLockfileSource(source)) {
            const key = `${dep.name}@${version}`
            if (isDependenciesSource(source)) {
              if (!depsSet.has(key)) {
                depsSet.add(key)
                prodDeps.push({ name: dep.name, version })
              }
            } else if (isDevDependenciesSource(source)) {
              if (!devDepsSet.has(key)) {
                devDepsSet.add(key)
                devDeps.push({ name: dep.name, version })
              }
            }
          }
        }
      }
    }

    // Sort deps alphabetically
    prodDeps.sort((a, b) => a.name.localeCompare(b.name))
    devDeps.sort((a, b) => a.name.localeCompare(b.name))

    // Combined list for transitive counting
    const directDeps = [...prodDeps, ...devDeps]

    // Build a map of parent -> children for transitive deps
    // Key: "parentName@version", Value: array of {name, version}
    const childrenMap = new Map<
      string,
      Array<{ name: string; version: string }>
    >()

    for (const dep of dependencies) {
      for (const [version, sources] of Object.entries(dep.versions)) {
        for (const source of Object.keys(sources)) {
          if (isLockfileSource(source)) {
            // Extract parent package from source like "pnpm-lock.yaml:tsup@8.5.0"
            // or "yarn.lock:react@18.2.0"
            const parentRef = extractParentRef(source)
            const children = childrenMap.get(parentRef) || []
            // Avoid duplicates
            if (
              !children.some(
                (c) => c.name === dep.name && c.version === version,
              )
            ) {
              children.push({ name: dep.name, version })
            }
            childrenMap.set(parentRef, children)
          }
        }
      }
    }

    // Count all transitive dependencies (full depth)
    const countAllTransitive = (
      name: string,
      version: string,
      visited: Set<string>,
    ): number => {
      const key = `${name}@${version}`
      if (visited.has(key)) return 0
      visited.add(key)

      const children = childrenMap.get(key) || []
      let count = children.length
      for (const child of children) {
        count += countAllTransitive(child.name, child.version, visited)
      }
      return count
    }

    // Print tree recursively
    const printTree = (
      name: string,
      version: string,
      depth: number,
      prefix: string,
      isLast: boolean,
    ) => {
      const connector = depth === 0 ? '' : isLast ? '└─ ' : '├─ '
      console.log(`${prefix}${connector}${name} ${version}`)

      if (depth >= maxDepth) return

      // Find children of this package
      const parentKey = `${name}@${version}`
      const children = childrenMap.get(parentKey) || []

      // Sort children alphabetically
      children.sort((a, b) => a.name.localeCompare(b.name))

      const childPrefix = depth === 0 ? '' : prefix + (isLast ? '   ' : '│  ')

      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        const isLastChild = i === children.length - 1
        printTree(
          child.name,
          child.version,
          depth + 1,
          childPrefix,
          isLastChild,
        )
      }
    }

    // Print dependencies section
    if (prodDeps.length > 0) {
      console.log('\x1b[1mdependencies:\x1b[0m')
      for (const dep of prodDeps) {
        printTree(dep.name, dep.version, 0, '', true)
      }
      console.log('')
    }

    // Print devDependencies section
    if (devDeps.length > 0) {
      console.log('\x1b[1mdevDependencies:\x1b[0m')
      for (const dep of devDeps) {
        printTree(dep.name, dep.version, 0, '', true)
      }
      console.log('')
    }

    // Calculate total transitive dependencies
    const visited = new Set<string>()
    let totalTransitive = 0
    for (const dep of directDeps) {
      totalTransitive += countAllTransitive(dep.name, dep.version, visited)
    }

    console.log(
      `${prodDeps.length} dependencies, ${devDeps.length} devDependencies, ${totalTransitive} transitive`,
    )

    return { success: true, message: 'Dependencies listed successfully.' }
  },
})
