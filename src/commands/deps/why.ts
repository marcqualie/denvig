import { Command } from '../../lib/command.ts'

import type { ProjectDependencySchema } from '../../lib/dependencies.ts'

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

    console.log(`${project.name}`)
    console.log('')

    const versionEntries = Object.entries(dep.versions)

    if (versionEntries.length === 0) {
      console.log(`${dependencyName} (no versions resolved)`)
      return { success: true, message: 'Dependency found but no versions.' }
    }

    for (const [version, sources] of versionEntries) {
      for (const [source, specifier] of Object.entries(sources)) {
        if (source === '.' || !source.startsWith('pnpm-lock.yaml:')) {
          // Direct dependency from a package.json
          const location = source === '.' ? 'dependencies' : source
          console.log(`${location}:`)
          console.log(`${dependencyName} ${version} (${specifier})`)
          console.log('')
        } else {
          // Transitive dependency - build the chain
          const parentRef = source.replace('pnpm-lock.yaml:', '')
          const chain = buildDependencyChain(parentRef, depsMap)

          if (chain.length > 0) {
            // Find which package.json the root of the chain comes from
            const rootDep = chain[0]
            const rootSources = Object.keys(
              Object.values(rootDep.versions)[0] || {},
            )
            const rootSource = rootSources.find(
              (s) => !s.startsWith('pnpm-lock.yaml:'),
            )
            const location =
              rootSource === '.' ? 'dependencies' : rootSource || 'dependencies'

            console.log(`${location}:`)

            // Print the chain as a tree
            for (let i = 0; i < chain.length; i++) {
              const chainDep = chain[i]
              const chainVersion = Object.keys(chainDep.versions)[0] || ''
              const indent = i === 0 ? '' : `${'  '.repeat(i - 1)}└─ `
              console.log(`${indent}${chainDep.name} ${chainVersion}`)
            }

            // Print the target dependency at the end
            const finalIndent = `${'  '.repeat(chain.length - 1)}└─ `
            console.log(`${finalIndent}${dependencyName} ${version}`)
            console.log('')
          } else {
            // Couldn't resolve the chain, just show what we have
            console.log(`via ${parentRef}:`)
            console.log(`└─ ${dependencyName} ${version}`)
            console.log('')
          }
        }
      }
    }

    return { success: true, message: 'Dependency chain shown.' }
  },
})

/**
 * Build the dependency chain from a parent reference back to a direct dependency
 */
function buildDependencyChain(
  parentRef: string,
  depsMap: Map<string, ProjectDependencySchema>,
): ProjectDependencySchema[] {
  const chain: ProjectDependencySchema[] = []
  let currentRef = parentRef

  // Limit iterations to prevent infinite loops
  const maxDepth = 20
  let depth = 0

  while (depth < maxDepth) {
    // Parse the parent reference (e.g., "tsup@8.5.0(typescript@5.9.3)(yaml@2.8.1)")
    const match = currentRef.match(/^([^@]+)@/)
    if (!match) break

    const depName = match[1]
    const dep = depsMap.get(depName)

    if (!dep) break

    chain.unshift(dep)

    // Find where this dependency comes from
    const versionEntries = Object.entries(dep.versions)
    if (versionEntries.length === 0) break

    // Look for a source that points to the parent
    let foundParent = false
    for (const [, sources] of versionEntries) {
      for (const source of Object.keys(sources)) {
        if (source === '.' || !source.startsWith('pnpm-lock.yaml:')) {
          // Found a direct dependency - we're done
          return chain
        }
        if (!foundParent) {
          // Follow this chain up
          currentRef = source.replace('pnpm-lock.yaml:', '')
          foundParent = true
        }
      }
    }

    if (!foundParent) break
    depth++
  }

  return chain
}
