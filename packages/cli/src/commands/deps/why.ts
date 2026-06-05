import {
  buildReverseChain,
  getSemverLevel,
  isDevDependenciesSource,
} from '@denvig/sdk/unsafe'
import semver from 'semver'

import { Command } from '../../lib/command.ts'
import { COLORS } from '../../lib/formatters/table.ts'
import {
  formatTree,
  mergeTreeNode,
  type TreeNode,
} from '../../lib/formatters/tree.ts'

import type { ProjectDependencySchema } from '@denvig/sdk/unsafe'

type RootChain = {
  tree: TreeNode
  isDev: boolean
}

type AvailableVersion = {
  version: string
  color: string
}

const colorForLevel = (level: 'major' | 'minor' | 'patch'): string => {
  if (level === 'major') return COLORS.red
  if (level === 'minor') return COLORS.yellow
  return COLORS.green
}

const isUpgrade = (from: string, to: string): boolean => {
  try {
    return semver.gt(to, from)
  } catch {
    return false
  }
}

const formatAvailableVersions = (versions: AvailableVersion[]): string => {
  if (versions.length === 0) return ''
  const inner = versions
    .map(({ version, color }) => `${color}${version}${COLORS.reset}`)
    .join(`${COLORS.grey}, ${COLORS.reset}`)
  return `${COLORS.grey}(${COLORS.reset}${inner}${COLORS.grey})${COLORS.reset}`
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
  flags: [
    {
      name: 'check-all-versions',
      description:
        'Fetch latest versions from the registry for every entry in the tree. Off by default since registry lookups can be slow; without this flag only the queried package is checked.',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  completions: async ({ project }) => {
    const dependencies = await project.activeWorktree.dependencies()
    return dependencies.map((d) => d.name)
  },
  handler: async ({ project, worktree, args, flags }) => {
    const dependencyName = args.dependency as string

    const allDependencies = await worktree.dependencies()
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

    const sortChildren = (node: TreeNode): void => {
      node.children.sort((a, b) => a.name.localeCompare(b.name))
      for (const child of node.children) sortChildren(child)
    }
    for (const tree of depChains) sortChildren(tree)
    for (const tree of devDepChains) sortChildren(tree)

    const chains: RootChain[] = [
      ...depChains.map((tree) => ({ tree, isDev: false })),
      ...devDepChains.map((tree) => ({ tree, isDev: true })),
    ].sort((a, b) => a.tree.name.localeCompare(b.tree.name))

    const checkVersions = flags['check-all-versions'] as boolean

    const outdatedMap = new Map<string, { latest: string; wanted: string }>()
    if (checkVersions) {
      const computeMaxDepth = (node: TreeNode, depth = 0): number => {
        if (node.children.length === 0) return depth
        return Math.max(
          ...node.children.map((child) => computeMaxDepth(child, depth + 1)),
        )
      }
      const outdatedDepth = chains.reduce(
        (max, { tree }) => Math.max(max, computeMaxDepth(tree)),
        0,
      )

      const outdated = await worktree
        .outdatedDependencies({ cache: true, depth: outdatedDepth })
        .catch(() => [])

      for (const o of outdated) {
        outdatedMap.set(o.name, { latest: o.latest, wanted: o.wanted })
      }
    } else {
      const info = await project.dependencies
        .info(`${dep.ecosystem}:${dep.name}`)
        .catch(() => null)
      if (info?.latest) {
        outdatedMap.set(dep.name, { latest: info.latest, wanted: info.latest })
      }
    }

    const getAvailableVersions = (
      name: string,
      version: string,
    ): AvailableVersion[] => {
      const o = outdatedMap.get(name)
      if (!o) return []
      const candidates = [o.wanted, o.latest].filter(
        (v): v is string => typeof v === 'string' && v.length > 0,
      )
      const versions: AvailableVersion[] = []
      const seen = new Set<string>([version])
      for (const candidate of candidates) {
        if (seen.has(candidate)) continue
        if (!isUpgrade(version, candidate)) continue
        const level = getSemverLevel(version, candidate)
        if (!level) continue
        seen.add(candidate)
        versions.push({ version: candidate, color: colorForLevel(level) })
      }
      return versions
    }

    const buildSuffix = (
      node: TreeNode,
      isRoot: boolean,
      isDev: boolean,
    ): string | undefined => {
      const parts: string[] = []
      if (isRoot && isDev) {
        parts.push(`${COLORS.grey}(dev)${COLORS.reset}`)
      }
      const formatted = formatAvailableVersions(
        getAvailableVersions(node.name, node.version),
      )
      if (formatted) parts.push(formatted)
      return parts.length > 0 ? parts.join(' ') : undefined
    }

    const decorate = (
      node: TreeNode,
      isRoot: boolean,
      isDev: boolean,
    ): TreeNode => ({
      ...node,
      color: node.name === dependencyName ? COLORS.white : COLORS.grey,
      suffix: buildSuffix(node, isRoot, isDev),
      children: node.children.map((child) => decorate(child, false, false)),
    })

    if (flags.json) {
      console.log(
        JSON.stringify({
          dependency: dependencyName,
          found: true,
          project: {
            name: worktree.name,
            path: worktree.path,
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
      const decorated = decorate(tree, true, isDev)
      const lines = formatTree(decorated, '', true, true)
      for (const line of lines) {
        console.log(line)
      }
    }

    return { success: true, message: 'Dependency chain shown.' }
  },
})
