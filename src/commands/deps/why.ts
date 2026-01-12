import { Command } from '../../lib/command.ts'
import {
  isDevDependenciesSource,
  isLockfileSource,
  parseParentFromSource,
} from '../../lib/deps/tree.ts'
import { COLORS } from '../../lib/formatters/table.ts'

import type { ProjectDependencySchema } from '../../lib/dependencies.ts'

type ChainNode = {
  name: string
  version: string
  children: ChainNode[]
}

export const depsWhyCommand = new Command({
  name: 'deps:why',
  description: 'Show why a dependency is installed',
  usage: 'deps:why <dependency>',
  example: 'denvig deps:why yaml',
  args: [
    {
      name: 'dependency',
      description: 'The dependency name to look up',
      required: true,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args }) => {
    const dependencyName = args.dependency as string
    const allDependencies = await project.dependencies()

    // Find the dependency
    const dep = allDependencies.find((d) => d.name === dependencyName)

    if (!dep) {
      console.log(`Dependency "${dependencyName}" not found in this project.`)
      return { success: false, message: 'Dependency not found.' }
    }

    // Build a map of all dependencies for resolving chains
    const depsMap = new Map<string, ProjectDependencySchema>()
    for (const d of allDependencies) {
      depsMap.set(d.name, d)
    }

    console.log(`${project.name} ${project.path}`)
    console.log('')

    // Group chains by source type (dependencies vs devDependencies)
    const depChains: ChainNode[] = []
    const devDepChains: ChainNode[] = []

    // For each version of the target dependency, build the chain back to root
    for (const v of dep.versions) {
      const chain = buildChainToRoot(dep.name, v.resolved, v.source, depsMap)
      if (chain) {
        // Determine if this is a dev dependency chain
        const rootDep = depsMap.get(chain.name)
        const isDevChain = rootDep?.versions.some((rv) =>
          isDevDependenciesSource(rv.source),
        )

        if (isDevChain) {
          mergeChain(devDepChains, chain)
        } else {
          mergeChain(depChains, chain)
        }
      }
    }

    // Print dependencies chains
    if (depChains.length > 0) {
      console.log('dependencies:')
      for (let i = 0; i < depChains.length; i++) {
        printTree(depChains[i], '', i === depChains.length - 1, true)
      }
      console.log('')
    }

    // Print devDependencies chains
    if (devDepChains.length > 0) {
      console.log('devDependencies:')
      for (let i = 0; i < devDepChains.length; i++) {
        printTree(devDepChains[i], '', i === devDepChains.length - 1, true)
      }
      console.log('')
    }

    if (depChains.length === 0 && devDepChains.length === 0) {
      console.log(
        `Could not determine dependency chain for "${dependencyName}".`,
      )
    }

    return { success: true, message: 'Dependency chain shown.' }
  },
})

/**
 * Build a chain from the target dependency back to a direct dependency.
 * Returns the chain as a tree structure starting from the root.
 */
function buildChainToRoot(
  targetName: string,
  targetVersion: string,
  source: string,
  depsMap: Map<string, ProjectDependencySchema>,
): ChainNode | null {
  // If this is a direct dependency, return it as a single node
  if (!isLockfileSource(source)) {
    return {
      name: targetName,
      version: targetVersion,
      children: [],
    }
  }

  // Build the chain by walking up the parent references
  const chain: { name: string; version: string }[] = [
    { name: targetName, version: targetVersion },
  ]

  let currentSource = source
  const maxDepth = 50
  let depth = 0

  while (depth < maxDepth) {
    const parent = parseParentFromSource(currentSource)
    if (!parent) break

    chain.unshift({ name: parent.name, version: parent.version })

    // Find the parent dependency and its source
    const parentDep = depsMap.get(parent.name)
    if (!parentDep) break

    // Find the version entry for this parent
    const parentVersion = parentDep.versions.find(
      (v) => v.resolved === parent.version,
    )
    if (!parentVersion) break

    // If this is a direct dependency, we're done
    if (!isLockfileSource(parentVersion.source)) {
      break
    }

    currentSource = parentVersion.source
    depth++
  }

  // Convert chain array to tree structure
  if (chain.length === 0) return null

  const root: ChainNode = {
    name: chain[0].name,
    version: chain[0].version,
    children: [],
  }

  let current = root
  for (let i = 1; i < chain.length; i++) {
    const child: ChainNode = {
      name: chain[i].name,
      version: chain[i].version,
      children: [],
    }
    current.children.push(child)
    current = child
  }

  return root
}

/**
 * Merge a chain into an existing tree, combining common prefixes.
 */
function mergeChain(trees: ChainNode[], chain: ChainNode): void {
  // Look for an existing tree with the same root
  const existing = trees.find(
    (t) => t.name === chain.name && t.version === chain.version,
  )

  if (existing) {
    // Merge children
    for (const child of chain.children) {
      mergeChain(existing.children, child)
    }
  } else {
    trees.push(chain)
  }
}

/**
 * Print a tree node with proper indentation and tree characters.
 */
function printTree(
  node: ChainNode,
  prefix: string,
  isLast: boolean,
  isRoot: boolean,
): void {
  const hasChildren = node.children.length > 0

  if (isRoot) {
    // Root nodes don't get tree prefixes
    console.log(`${node.name} ${COLORS.grey}${node.version}${COLORS.reset}`)
  } else {
    // Non-root nodes get tree prefixes
    const branch = hasChildren
      ? isLast
        ? '└─┬ '
        : '├─┬ '
      : isLast
        ? '└── '
        : '├── '

    console.log(
      `${prefix}${branch}${node.name} ${COLORS.grey}${node.version}${COLORS.reset}`,
    )
  }

  // Print children
  const childPrefix = isRoot ? '' : prefix + (isLast ? '  ' : '│ ')

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    const childIsLast = i === node.children.length - 1
    printTree(child, childPrefix, childIsLast, false)
  }
}
