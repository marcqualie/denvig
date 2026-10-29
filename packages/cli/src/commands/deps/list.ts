import { DenvigValidationError } from '@denvig/sdk'
import {
  buildDependabotSnapshot,
  resolveDependabotContext,
} from '@denvig/sdk/internal'

import { Command } from '../../lib/command.ts'
import { COLORS, formatTable } from '../../lib/formatters/table.ts'

export const depsListCommand = new Command({
  name: 'deps:list',
  description: 'List all dependencies detected by plugins',
  usage:
    'deps list [--depth <n>] [--ecosystem <name>] [--format table|json|dependabot]',
  example: 'denvig deps list --depth 1',
  args: [],
  flags: [
    {
      name: 'depth',
      description: 'Show subdependencies up to N levels deep (default: 0)',
      required: false,
      type: 'number',
      defaultValue: 0,
    },
    {
      name: 'ecosystem',
      description:
        'Filter to a specific ecosystem (e.g., npm, rubygems, pypi, actions)',
      required: false,
      type: 'string',
      defaultValue: undefined,
    },
    {
      name: 'format',
      description:
        'Output format: table, json, or dependabot (GitHub dependency submission snapshot)',
      required: false,
      type: 'string',
      defaultValue: 'table',
    },
  ],
  handler: async ({ sdk, project, flags }) => {
    const ecosystemFilter = flags.ecosystem as string | undefined
    const maxDepth = (flags.depth as number) ?? 0
    const format =
      flags.json && flags.format === 'table' ? 'json' : (flags.format as string)

    if (!['table', 'json', 'dependabot'].includes(format)) {
      const message = `Invalid format "${format}". Must be "table", "json", or "dependabot".`
      console.error(message)
      return { success: false, message }
    }

    const dependencies = await project.dependencies.list()

    if (format === 'dependabot') {
      let context: Awaited<ReturnType<typeof resolveDependabotContext>>
      try {
        context = await resolveDependabotContext({
          cwd: project.path,
          ecosystem: ecosystemFilter,
        })
      } catch (e) {
        if (e instanceof DenvigValidationError) {
          console.error(e.message)
          return { success: false, message: e.message }
        }
        throw e
      }
      const snapshot = buildDependabotSnapshot({
        dependencies: ecosystemFilter
          ? dependencies.filter((dep) => dep.ecosystem === ecosystemFilter)
          : dependencies,
        context,
        detector: {
          name: 'denvig',
          version: sdk.version(),
          url: 'https://github.com/marcqualie/denvig',
        },
        scanned: new Date().toISOString(),
      })
      console.log(JSON.stringify(snapshot))
      return { success: true, message: 'Dependency snapshot generated.' }
    }

    if (dependencies.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify([]))
      } else {
        console.log('No dependencies detected in this project.')
      }
      return { success: true, message: 'No dependencies detected.' }
    }

    const entries = await project.dependencies.tree({
      depth: maxDepth,
      ecosystem: ecosystemFilter,
    })

    if (entries.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify([]))
      } else {
        const message = ecosystemFilter
          ? `No dependencies found for ecosystem "${ecosystemFilter}".`
          : 'No direct dependencies detected in this project.'
        console.log(message)
      }
      return {
        success: true,
        message: ecosystemFilter
          ? `No dependencies found for ecosystem "${ecosystemFilter}".`
          : 'No direct dependencies detected in this project.',
      }
    }

    // JSON output
    if (format === 'json') {
      console.log(JSON.stringify(dependencies))
      return { success: true, message: 'Dependencies listed successfully.' }
    }

    // Check if we have multiple ecosystems (hide column if filtered to one)
    const ecosystems = new Set(entries.map((e) => e.ecosystem))
    const showEcosystem = ecosystems.size > 1 && !ecosystemFilter

    const lines = formatTable({
      columns: [
        { header: 'Package', accessor: (e) => e.name },
        {
          header: '',
          accessor: (e) =>
            e.depth === 0 && e.isDevDependency
              ? `${COLORS.grey}(dev)${COLORS.reset}`
              : '    ',
        },
        { header: 'Current', accessor: (e) => e.version },
        {
          header: 'Ecosystem',
          accessor: (e) => e.ecosystem,
          visible: showEcosystem,
        },
      ],
      data: entries,
      tree: {
        getDepth: (e) => e.depth,
        getIsLast: (e) => e.isLast,
        getHasChildren: (e) => e.hasChildren,
        getParentPath: (e) => e.parentPath,
      },
    })

    for (const line of lines) {
      console.log(line)
    }

    // Summary
    const rootEntries = entries.filter((e) => e.depth === 0)
    const prodCount = rootEntries.filter((e) => !e.isDevDependency).length
    const devCount = rootEntries.filter((e) => e.isDevDependency).length
    const subDepCount = dependencies.length - rootEntries.length

    console.log('')
    console.log(
      `${dependencies.length} total (${prodCount} dependencies, ${devCount} devDependencies, ${subDepCount} subdependencies)`,
    )

    return { success: true, message: 'Dependencies listed successfully.' }
  },
})
