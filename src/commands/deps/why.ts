import { Command } from '../../lib/command.ts'
import {
  buildReverseChain,
  isDevDependenciesSource,
} from '../../lib/deps/tree.ts'
import { COLORS } from '../../lib/formatters/table.ts'
import {
  formatTree,
  mergeTreeNode,
  type TreeNode,
} from '../../lib/formatters/tree.ts'
import { getSemverLevel } from '../../lib/semver.ts'

import type { ProjectDependencySchema } from '../../lib/dependencies.ts'

type RootChain = {
  tree: TreeNode
  isDev: boolean
}

export const depsWhyCommand = new Command({
  name: 'deps:why',
  description: 'Show why a dependency is installed',
  usage: 'deps why <dependency>',
  example: 'denvig deps why yaml',
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

    const [allDependencies, outdated] = await Promise.all([
      project.dependencies(),
      project.outdatedDependencies({ cache: true }).catch(() => []),
    ])

    const dep = allDependencies.find((d) => d.name === dependencyName)

    if (!dep) {
      if (flags.json) {
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

    const depsMap = new Map<string, ProjectDependencySchema>()
    for (const d of allDependencies) {
      depsMap.set(d.name, d)
    }

    const outdatedMap = new Map<string, { latest: string; wanted: string }>()
    for (const o of outdated) {
      outdatedMap.set(o.name, { latest: o.latest, wanted: o.wanted })
    }

    const getNodeColor = (name: string, version: string): string => {
      const o = outdatedMap.get(name)
      if (o) {
        const level = getSemverLevel(version, o.latest)
        if (level === 'major') return COLORS.red
        if (level === 'minor') return COLORS.yellow
        if (level === 'patch') return COLORS.green
      }
      return name === dependencyName ? COLORS.white : COLORS.grey
    }

    const decorate = (node: TreeNode): TreeNode => ({
      ...node,
      color: getNodeColor(node.name, node.version),
      children: node.children.map(decorate),
    })

    const chains: RootChain[] = []
    const depChains: TreeNode[] = []
    const devDepChains: TreeNode[] = []

    for (const v of dep.versions) {
      const chain = buildReverseChain(dep.name, v.resolved, v.source, depsMap)
      if (!chain) continue

      const rootDep = depsMap.get(chain.name)
      const rootVersion = rootDep?.versions.find(
        (rv) => rv.resolved === chain.version,
      )
      const isDevChain = rootVersion
        ? isDevDependenciesSource(rootVersion.source)
        : false

      if (isDevChain) {
        mergeTreeNode(devDepChains, chain)
      } else {
        mergeTreeNode(depChains, chain)
      }
    }

    for (const tree of depChains) chains.push({ tree, isDev: false })
    for (const tree of devDepChains) chains.push({ tree, isDev: true })

    if (flags.json) {
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

    if (chains.length === 0) {
      console.log(
        `Could not determine dependency chain for "${dependencyName}".`,
      )
      return { success: true, message: 'Dependency chain shown.' }
    }

    for (const { tree, isDev } of chains) {
      const decorated = decorate(tree)
      if (isDev) decorated.suffix = '(dev)'
      const lines = formatTree(decorated, '', true, true)
      for (const line of lines) {
        console.log(line)
      }
    }

    return { success: true, message: 'Dependency chain shown.' }
  },
})
