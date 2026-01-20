import { Command } from '../../lib/command.ts'
import {
  buildReverseChain,
  isDevDependenciesSource,
} from '../../lib/deps/tree.ts'
import {
  formatTree,
  mergeTreeNode,
  type TreeNode,
} from '../../lib/formatters/tree.ts'

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
  completions: async ({ project }) => {
    const dependencies = await project.dependencies()
    return dependencies.map((d) => d.name)
  },
  handler: async ({ project, args, flags }) => {
    const dependencyName = args.dependency as string
    const allDependencies = await project.dependencies()

    // Find the dependency
    const dep = allDependencies.find((d) => d.name === dependencyName)

    if (!dep) {
      if (flags.format === 'json') {
        console.log(
          JSON.stringify({
            dependency: dependencyName,
            found: false,
            dependencies: [],
            devDependencies: [],
          }),
        )
      } else {
        console.log(`Dependency "${dependencyName}" not found in this project.`)
      }
      return { success: false, message: 'Dependency not found.' }
    }

    // Build a map of all dependencies for resolving chains
    const depsMap = new Map<string, ProjectDependencySchema>()
    for (const d of allDependencies) {
      depsMap.set(d.name, d)
    }

    // Group chains by source type (dependencies vs devDependencies)
    const depChains: TreeNode[] = []
    const devDepChains: TreeNode[] = []

    // For each version of the target dependency, build the chain back to root
    for (const v of dep.versions) {
      const chain = buildReverseChain(dep.name, v.resolved, v.source, depsMap)
      if (chain) {
        // Determine if this is a dev dependency chain
        const rootDep = depsMap.get(chain.name)
        const isDevChain = rootDep?.versions.some((rv) =>
          isDevDependenciesSource(rv.source),
        )

        if (isDevChain) {
          mergeTreeNode(devDepChains, chain)
        } else {
          mergeTreeNode(depChains, chain)
        }
      }
    }

    // JSON output
    if (flags.format === 'json') {
      console.log(
        JSON.stringify({
          dependency: dependencyName,
          found: true,
          project: {
            name: project.name,
            path: project.path,
          },
          dependencies: depChains,
          devDependencies: devDepChains,
        }),
      )
      return { success: true, message: 'Dependency chain shown.' }
    }

    console.log(`${project.name} ${project.path}`)
    console.log('')

    // Print dependencies chains
    if (depChains.length > 0) {
      console.log('dependencies:')
      for (let i = 0; i < depChains.length; i++) {
        const lines = formatTree(
          depChains[i],
          '',
          i === depChains.length - 1,
          true,
        )
        for (const line of lines) {
          console.log(line)
        }
      }
      console.log('')
    }

    // Print devDependencies chains
    if (devDepChains.length > 0) {
      console.log('devDependencies:')
      for (let i = 0; i < devDepChains.length; i++) {
        const lines = formatTree(
          devDepChains[i],
          '',
          i === devDepChains.length - 1,
          true,
        )
        for (const line of lines) {
          console.log(line)
        }
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
