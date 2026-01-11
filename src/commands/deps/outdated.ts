import { Command } from '../../lib/command.ts'

// ANSI color codes
const COLORS = {
  reset: '\x1b[0m',
  white: '\x1b[37m',
  grey: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
}

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
  usage: 'deps:outdated [--no-cache] [--semver patch|minor]',
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
  ],
  handler: async ({ project, flags }) => {
    const cache = !(flags['no-cache'] as boolean)
    const semverFilter = flags.semver as 'patch' | 'minor' | undefined

    // Validate semver flag
    if (semverFilter && semverFilter !== 'patch' && semverFilter !== 'minor') {
      console.error(
        `Invalid --semver value: "${semverFilter}". Must be "patch" or "minor".`,
      )
      return { success: false, message: 'Invalid --semver value.' }
    }

    const outdated = await project.outdatedDependencies({ cache })
    let entries = Object.entries(outdated)

    // Filter by semver level if specified
    if (semverFilter) {
      entries = entries.filter(([, info]) => {
        const level = getSemverLevel(info.current, info.wanted)
        return matchesSemverFilter(level, semverFilter)
      })
    }

    if (entries.length === 0) {
      const message = semverFilter
        ? `No ${semverFilter}-level updates available.`
        : 'All dependencies are up to date!'
      console.log(message)
      return { success: true, message }
    }

    // Sort entries alphabetically
    const sortedEntries = entries.sort((a, b) => a[0].localeCompare(b[0]))

    // Calculate column widths for nice formatting
    // Account for "(dev)" suffix in name column
    const maxNameLen = Math.max(
      ...entries.map(([name, info]) =>
        info.isDevDependency ? name.length + 6 : name.length,
      ),
      10,
    )
    const maxVersionLen = Math.max(
      ...entries.map(([, info]) =>
        Math.max(info.current.length, info.wanted.length, info.latest.length),
      ),
      7,
    )

    // Print header
    console.log(
      `${'Package'.padEnd(maxNameLen)}  ${'Current'.padEnd(maxVersionLen)}  ${'Wanted'.padEnd(maxVersionLen)}  ${'Latest'.padEnd(maxVersionLen)}`,
    )
    console.log('-'.repeat(maxNameLen + maxVersionLen * 3 + 6))

    // Print each dependency
    for (const [name, info] of sortedEntries) {
      const wantedColor = getVersionColor(info.current, info.wanted)
      const latestColor = getVersionColor(info.current, info.latest)

      const devSuffix = info.isDevDependency
        ? `${COLORS.grey} (dev)${COLORS.reset}`
        : ''
      const displayName = info.isDevDependency
        ? name.padEnd(maxNameLen - 6)
        : name.padEnd(maxNameLen)

      console.log(
        `${displayName}${devSuffix}  ${info.current.padEnd(maxVersionLen)}  ${wantedColor}${info.wanted.padEnd(maxVersionLen)}${COLORS.reset}  ${latestColor}${info.latest.padEnd(maxVersionLen)}${COLORS.reset}`,
      )
    }

    return { success: true, message: 'Outdated dependencies listed.' }
  },
})
