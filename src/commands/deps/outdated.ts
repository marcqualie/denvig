import { Command } from '../../lib/command.ts'
import { COLORS, formatTable } from '../../lib/formatters/table.ts'
import { getSemverLevel, matchesSemverFilter } from '../../lib/semver.ts'

/**
 * Get the color for a version update based on semver difference.
 * - white: versions match
 * - green: patch version update
 * - yellow: minor version update
 * - red: major version update
 */
const getVersionColor = (current: string, target: string): string => {
  if (current === target) return COLORS.white

  const level = getSemverLevel(current, target)
  if (!level) return COLORS.white

  if (level === 'major') return COLORS.red
  if (level === 'minor') return COLORS.yellow
  if (level === 'patch') return COLORS.green

  return COLORS.white
}

export const depsOutdatedCommand = new Command({
  name: 'deps:outdated',
  description: 'Show outdated dependencies',
  usage:
    'deps outdated [--no-cache] [--semver patch|minor] [--ecosystem <name>]',
  example: 'denvig deps outdated --semver patch',
  args: [],
  flags: [
    {
      name: 'no-cache',
      description: 'Skip cache and fetch fresh data from registry',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'semver',
      description:
        'Filter by semver level: "patch" for patch updates only, "minor" for minor and patch updates',
      required: false,
      type: 'string',
      defaultValue: undefined,
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
    const cache = !(flags['no-cache'] as boolean)
    const semverFilter = flags.semver as 'patch' | 'minor' | undefined
    const ecosystemFilter = flags.ecosystem as string | undefined

    // Validate semver flag
    if (semverFilter && semverFilter !== 'patch' && semverFilter !== 'minor') {
      console.error(
        `Invalid --semver value: "${semverFilter}". Must be "patch" or "minor".`,
      )
      return { success: false, message: 'Invalid --semver value.' }
    }

    const outdated = await project.outdatedDependencies({ cache })
    let entries = outdated

    // Helper to get current version from versions array
    const getCurrent = (dep: (typeof entries)[0]) =>
      dep.versions[0]?.resolved || ''

    // Filter by ecosystem if specified
    if (ecosystemFilter) {
      entries = entries.filter((dep) => dep.ecosystem === ecosystemFilter)
    }

    // Filter by semver level if specified (compare against latest version)
    if (semverFilter) {
      entries = entries.filter((dep) => {
        const level = getSemverLevel(getCurrent(dep), dep.latest)
        return matchesSemverFilter(level, semverFilter)
      })
    }

    if (entries.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        let message = 'All dependencies are up to date!'
        if (ecosystemFilter && semverFilter) {
          message = `No ${semverFilter}-level updates available for ecosystem "${ecosystemFilter}".`
        } else if (ecosystemFilter) {
          message = `No outdated dependencies found for ecosystem "${ecosystemFilter}".`
        } else if (semverFilter) {
          message = `No ${semverFilter}-level updates available.`
        }
        console.log(message)
      }
      let message = 'All dependencies are up to date!'
      if (ecosystemFilter && semverFilter) {
        message = `No ${semverFilter}-level updates available for ecosystem "${ecosystemFilter}".`
      } else if (ecosystemFilter) {
        message = `No outdated dependencies found for ecosystem "${ecosystemFilter}".`
      } else if (semverFilter) {
        message = `No ${semverFilter}-level updates available.`
      }
      return { success: true, message }
    }

    // Sort entries by ecosystem first, then alphabetically by name
    const sortedEntries = entries.sort((a, b) => {
      const ecosystemCompare = a.ecosystem.localeCompare(b.ecosystem)
      if (ecosystemCompare !== 0) return ecosystemCompare
      return a.name.localeCompare(b.name)
    })

    // JSON output
    if (flags.json) {
      console.log(JSON.stringify(sortedEntries))
      return { success: true, message: 'Outdated dependencies listed.' }
    }

    // Check if we have multiple ecosystems (hide column if filtered to one)
    const ecosystems = new Set(entries.map((dep) => dep.ecosystem))
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
        { header: 'Current', accessor: (dep) => getCurrent(dep) },
        {
          header: 'Wanted',
          accessor: (dep) => dep.wanted,
          format: (value, dep) => {
            const color = getVersionColor(getCurrent(dep), dep.wanted)
            return `${color}${value}${COLORS.reset}`
          },
        },
        {
          header: 'Latest',
          accessor: (dep) => dep.latest,
          format: (value, dep) => {
            const color = getVersionColor(getCurrent(dep), dep.latest)
            return `${color}${value}${COLORS.reset}`
          },
        },
        {
          header: 'Ecosystem',
          accessor: (dep) => dep.ecosystem,
          visible: showEcosystem,
        },
      ],
      data: sortedEntries,
    })

    for (const line of lines) {
      console.log(line)
    }

    return { success: true, message: 'Outdated dependencies listed.' }
  },
})
