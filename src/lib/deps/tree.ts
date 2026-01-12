import type { ProjectDependencySchema } from '../dependencies.ts'

/**
 * Lockfile source prefixes for different package managers.
 */
const LOCKFILE_PREFIXES = [
  'pnpm-lock.yaml:',
  'yarn.lock:',
  'Gemfile.lock:',
  'uv.lock:',
]

/**
 * A dependency entry with tree metadata for rendering.
 */
export type TreeDependencyEntry = {
  name: string
  version: string
  ecosystem: string
  isDevDependency: boolean
  depth: number
  isLast: boolean
  hasChildren: boolean
  parentPath: boolean[] // Track which ancestors are "last" for proper prefix rendering
  dependencyType?: string // e.g., "peer", "optional"
}

/**
 * Parse a lockfile source to extract the parent package reference.
 * Returns null if the source is not from a lockfile.
 *
 * @example
 * parseParentFromSource('pnpm-lock.yaml:tsup@8.5.0') // { name: 'tsup', version: '8.5.0' }
 * parseParentFromSource('.#dependencies') // null
 */
export const parseParentFromSource = (
  source: string,
): { name: string; version: string } | null => {
  for (const prefix of LOCKFILE_PREFIXES) {
    if (source.startsWith(prefix)) {
      const ref = source.slice(prefix.length)
      // Parse "package@version" or "package@version(peer@1.0.0)"
      const match = ref.match(/^([^@]+)@([^(@]+)/)
      if (match) {
        return { name: match[1], version: match[2] }
      }
    }
  }
  return null
}

/**
 * Check if a source is from a lockfile (transitive dependency).
 */
export const isLockfileSource = (source: string): boolean => {
  return LOCKFILE_PREFIXES.some((prefix) => source.startsWith(prefix))
}

/**
 * Check if a source is from dependencies section.
 */
export const isDependenciesSource = (source: string): boolean => {
  return source.endsWith('#dependencies')
}

/**
 * Check if a source is from devDependencies section.
 */
export const isDevDependenciesSource = (source: string): boolean => {
  return source.endsWith('#devDependencies')
}

type DependencyNode = {
  dep: ProjectDependencySchema
  version: string
  isDevDependency: boolean
  children: DependencyNode[]
}

/**
 * Build a dependency tree from a flat list of dependencies.
 * Returns entries flattened with tree metadata for rendering.
 */
export const buildDependencyTree = (
  dependencies: ProjectDependencySchema[],
  maxDepth: number,
  ecosystemFilter?: string,
): TreeDependencyEntry[] => {
  // Build lookup maps
  const depsByName = new Map<string, ProjectDependencySchema>()
  for (const dep of dependencies) {
    depsByName.set(dep.name, dep)
  }

  // Find direct dependencies and build root nodes
  const rootNodes: DependencyNode[] = []
  const directDeps = new Set<string>()

  for (const dep of dependencies) {
    if (ecosystemFilter && dep.ecosystem !== ecosystemFilter) continue

    for (const v of dep.versions) {
      if (!isLockfileSource(v.source)) {
        const isDevDependency = isDevDependenciesSource(v.source)
        const isDependency = isDependenciesSource(v.source)

        if (isDependency || isDevDependency) {
          const key = `${dep.name}@${v.resolved}`
          if (!directDeps.has(key)) {
            directDeps.add(key)
            rootNodes.push({
              dep,
              version: v.resolved,
              isDevDependency,
              children: [],
            })
          }
        }
      }
    }
  }

  // Build child relationships if depth > 0
  if (maxDepth > 0) {
    // Create a map of parent -> children relationships
    const childrenByParent = new Map<string, ProjectDependencySchema[]>()

    for (const dep of dependencies) {
      if (ecosystemFilter && dep.ecosystem !== ecosystemFilter) continue

      for (const v of dep.versions) {
        const parent = parseParentFromSource(v.source)
        if (parent) {
          const parentKey = `${parent.name}@${parent.version}`
          const existing = childrenByParent.get(parentKey) || []
          if (!existing.some((d) => d.name === dep.name)) {
            existing.push(dep)
            childrenByParent.set(parentKey, existing)
          }
        }
      }
    }

    // Recursively build children for each root node
    const buildChildren = (
      node: DependencyNode,
      currentDepth: number,
      visited: Set<string>,
    ) => {
      if (currentDepth >= maxDepth) return

      const parentKey = `${node.dep.name}@${node.version}`
      if (visited.has(parentKey)) return // Prevent cycles

      visited.add(parentKey)
      const children = childrenByParent.get(parentKey) || []

      for (const childDep of children) {
        // Find the version that references this parent
        const childVersion = childDep.versions.find((v) => {
          const parent = parseParentFromSource(v.source)
          return (
            parent?.name === node.dep.name && parent?.version === node.version
          )
        })

        if (childVersion) {
          const childNode: DependencyNode = {
            dep: childDep,
            version: childVersion.resolved,
            isDevDependency: false,
            children: [],
          }
          node.children.push(childNode)
          buildChildren(childNode, currentDepth + 1, new Set(visited))
        }
      }

      // Sort children alphabetically
      node.children.sort((a, b) => a.dep.name.localeCompare(b.dep.name))
    }

    for (const root of rootNodes) {
      buildChildren(root, 0, new Set())
    }
  }

  // Sort root nodes by ecosystem then name
  rootNodes.sort((a, b) => {
    const ecosystemCompare = a.dep.ecosystem.localeCompare(b.dep.ecosystem)
    if (ecosystemCompare !== 0) return ecosystemCompare
    return a.dep.name.localeCompare(b.dep.name)
  })

  // Flatten tree to entries with metadata
  const entries: TreeDependencyEntry[] = []

  const flatten = (
    node: DependencyNode,
    depth: number,
    isLast: boolean,
    parentPath: boolean[],
  ) => {
    entries.push({
      name: node.dep.name,
      version: node.version,
      ecosystem: node.dep.ecosystem,
      isDevDependency: node.isDevDependency,
      depth,
      isLast,
      hasChildren: node.children.length > 0,
      parentPath: [...parentPath],
    })

    const newParentPath = [...parentPath, isLast]
    node.children.forEach((child, index) => {
      flatten(
        child,
        depth + 1,
        index === node.children.length - 1,
        newParentPath,
      )
    })
  }

  rootNodes.forEach((root, index) => {
    flatten(root, 0, index === rootNodes.length - 1, [])
  })

  return entries
}
