import { Command } from '../../lib/command.ts'
import { COLORS, formatTable } from '../../lib/formatters/table.ts'

/**
 * Parse a semver version string into components.
 */
const parseVersion = (
  version: string,
): { major: number; minor: number; patch: number } | null => {
  const match = version.match(/^(\d+)\.(\d+)\.(\d+)/)
  if (!match) return null
  return {
    major: Number.parseInt(match[1], 10),
    minor: Number.parseInt(match[2], 10),
    patch: Number.parseInt(match[3], 10),
  }
}

/**
 * Get the color for a version update based on semver difference.
 * - white: versions match
 * - green: patch version update
 * - yellow: minor version update
 * - red: major version update
 */
const getVersionColor = (current: string, target: string): string => {
  if (current === target) return COLORS.white

  const currentParsed = parseVersion(current)
  const targetParsed = parseVersion(target)

  if (!currentParsed || !targetParsed) return COLORS.white

  if (targetParsed.major !== currentParsed.major) {
    return COLORS.red
  }
  if (targetParsed.minor !== currentParsed.minor) {
    return COLORS.yellow
  }
  if (targetParsed.patch !== currentParsed.patch) {
    return COLORS.green
  }

  return COLORS.white
}

/**
 * Get the semver update level between two versions.
 * Returns 'major', 'minor', 'patch', or null if versions match or can't be parsed.
 */
const getSemverLevel = (
  current: string,
  target: string,
): 'major' | 'minor' | 'patch' | null => {
  if (current === target) return null

  const currentParsed = parseVersion(current)
  const targetParsed = parseVersion(target)

  if (!currentParsed || !targetParsed) return null

  if (targetParsed.major !== currentParsed.major) {
    return 'major'
  }
  if (targetParsed.minor !== currentParsed.minor) {
    return 'minor'
  }
  if (targetParsed.patch !== currentParsed.patch) {
    return 'patch'
  }

  return null
}

/**
 * Check if a semver level matches the filter.
 * - 'patch': only patch updates match
 * - 'minor': minor and patch updates match
 */
const matchesSemverFilter = (
  level: 'major' | 'minor' | 'patch' | null,
  filter: 'patch' | 'minor',
): boolean => {
  if (level === null) return false
  if (filter === 'patch') return level === 'patch'
  if (filter === 'minor') return level === 'patch' || level === 'minor'
  return false
}

export const depsOutdatedCommand = new Command({
  name: 'deps:outdated',
  description: 'Show outdated dependencies',
  usage:
    'deps:outdated [--no-cache] [--semver patch|minor] [--ecosystem <name>]',
  example: 'denvig deps:outdated --semver patch',
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

    // Filter by semver level if specified
    if (semverFilter) {
      entries = entries.filter((dep) => {
        const level = getSemverLevel(getCurrent(dep), dep.wanted)
        return matchesSemverFilter(level, semverFilter)
      })
    }

    if (entries.length === 0) {
      let message = 'All dependencies are up to date!'
      if (ecosystemFilter && semverFilter) {
        message = `No ${semverFilter}-level updates available for ecosystem "${ecosystemFilter}".`
      } else if (ecosystemFilter) {
        message = `No outdated dependencies found for ecosystem "${ecosystemFilter}".`
      } else if (semverFilter) {
        message = `No ${semverFilter}-level updates available.`
      }
      console.log(message)
      return { success: true, message }
    }

    // Sort entries by ecosystem first, then alphabetically by name
    const sortedEntries = entries.sort((a, b) => {
      const ecosystemCompare = a.ecosystem.localeCompare(b.ecosystem)
      if (ecosystemCompare !== 0) return ecosystemCompare
      return a.name.localeCompare(b.name)
    })

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
