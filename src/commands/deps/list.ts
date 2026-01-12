import { Command } from '../../lib/command.ts'
import { COLORS, formatTable } from '../../lib/formatters/table.ts'

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

type DependencyEntry = {
  name: string
  version: string
  ecosystem: string
  isDevDependency: boolean
}

export const depsListCommand = new Command({
  name: 'deps:list',
  description: 'List all dependencies detected by plugins',
  usage: 'deps:list [--ecosystem <name>]',
  example: 'denvig deps:list --ecosystem npm',
  args: [],
  flags: [
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
    const dependencies = await project.dependencies()

    if (dependencies.length === 0) {
      console.log('No dependencies detected in this project.')
      return { success: true, message: 'No dependencies detected.' }
    }

    // Find direct dependencies only (sources not from lockfile)
    let entries: DependencyEntry[] = []
    const seenKeys = new Set<string>()

    for (const dep of dependencies) {
      for (const v of dep.versions) {
        if (!isLockfileSource(v.source)) {
          const isDevDependency = isDevDependenciesSource(v.source)
          const isDependency = isDependenciesSource(v.source)

          if (isDependency || isDevDependency) {
            const key = `${dep.name}@${v.resolved}@${dep.ecosystem}`
            if (!seenKeys.has(key)) {
              seenKeys.add(key)
              entries.push({
                name: dep.name,
                version: v.resolved,
                ecosystem: dep.ecosystem,
                isDevDependency,
              })
            }
          }
        }
      }
    }

    // Filter by ecosystem if specified
    if (ecosystemFilter) {
      entries = entries.filter((e) => e.ecosystem === ecosystemFilter)
    }

    // Sort entries by ecosystem first, then alphabetically by name
    entries.sort((a, b) => {
      const ecosystemCompare = a.ecosystem.localeCompare(b.ecosystem)
      if (ecosystemCompare !== 0) return ecosystemCompare
      return a.name.localeCompare(b.name)
    })

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

    // Format and print table
    const lines = formatTable({
      columns: [
        {
          header: 'Package',
          accessor: (e) => e.name,
        },
        {
          header: '',
          accessor: (e) =>
            e.isDevDependency ? `${COLORS.grey}(dev)${COLORS.reset}` : '    ',
        },
        { header: 'Current', accessor: (e) => e.version },
        {
          header: 'Ecosystem',
          accessor: (e) => e.ecosystem,
          visible: showEcosystem,
        },
      ],
      data: entries,
    })

    for (const line of lines) {
      console.log(line)
    }

    // Summary
    const prodCount = entries.filter((e) => !e.isDevDependency).length
    const devCount = entries.filter((e) => e.isDevDependency).length
    console.log('')
    console.log(`${prodCount} dependencies, ${devCount} devDependencies`)

    return { success: true, message: 'Dependencies listed successfully.' }
  },
})
