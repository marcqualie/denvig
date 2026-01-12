import { Command } from '../../lib/command.ts'
import { buildDependencyTree } from '../../lib/deps/tree.ts'
import { COLORS, formatTable } from '../../lib/formatters/table.ts'

export const depsListCommand = new Command({
  name: 'deps:list',
  description: 'List all dependencies detected by plugins',
  usage: 'deps:list [--depth <n>] [--ecosystem <name>]',
  example: 'denvig deps:list --depth 1',
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
      description: 'Filter to a specific ecosystem (e.g., npm, rubygems, pypi)',
      required: false,
      type: 'string',
      defaultValue: undefined,
    },
  ],
  handler: async ({ project, flags }) => {
    const ecosystemFilter = flags.ecosystem as string | undefined
    const maxDepth = (flags.depth as number) ?? 0
    const dependencies = await project.dependencies()

    if (dependencies.length === 0) {
      console.log('No dependencies detected in this project.')
      return { success: true, message: 'No dependencies detected.' }
    }

    const entries = buildDependencyTree(dependencies, maxDepth, ecosystemFilter)

    if (entries.length === 0) {
      const message = ecosystemFilter
        ? `No dependencies found for ecosystem "${ecosystemFilter}".`
        : 'No direct dependencies detected in this project.'
      console.log(message)
      return { success: true, message }
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
    const subDepCount = entries.length - rootEntries.length

    console.log('')
    if (subDepCount > 0) {
      console.log(
        `${prodCount} dependencies, ${devCount} devDependencies, ${subDepCount} subdependencies`,
      )
    } else {
      console.log(`${prodCount} dependencies, ${devCount} devDependencies`)
    }

    return { success: true, message: 'Dependencies listed successfully.' }
  },
})
