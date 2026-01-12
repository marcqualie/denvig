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

    // Helper to get current version from versions map
    const getCurrent = (dep: (typeof entries)[0]) =>
      Object.keys(dep.versions)[0] || ''

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

    // Calculate column widths for nice formatting
    // Account for "(dev)" suffix in name column
    const maxNameLen = Math.max(
      ...entries.map((dep) =>
        dep.isDevDependency ? dep.name.length + 6 : dep.name.length,
      ),
      7, // "Package"
    )
    const maxVersionLen = Math.max(
      ...entries.map((dep) =>
        Math.max(getCurrent(dep).length, dep.wanted.length, dep.latest.length),
      ),
      7, // "Current"
    )
    const maxEcosystemLen = showEcosystem
      ? Math.max(...entries.map((dep) => dep.ecosystem.length), 9) // "Ecosystem"
      : 0

    // Print header
    if (showEcosystem) {
      console.log(
        `${'Package'.padEnd(maxNameLen)}  ${'Current'.padEnd(maxVersionLen)}  ${'Wanted'.padEnd(maxVersionLen)}  ${'Latest'.padEnd(maxVersionLen)}  ${'Ecosystem'.padEnd(maxEcosystemLen)}`,
      )
      console.log(
        '-'.repeat(maxNameLen + maxVersionLen * 3 + maxEcosystemLen + 8),
      )
    } else {
      console.log(
        `${'Package'.padEnd(maxNameLen)}  ${'Current'.padEnd(maxVersionLen)}  ${'Wanted'.padEnd(maxVersionLen)}  ${'Latest'.padEnd(maxVersionLen)}`,
      )
      console.log('-'.repeat(maxNameLen + maxVersionLen * 3 + 6))
    }

    // Print each dependency
    for (const dep of sortedEntries) {
      const current = getCurrent(dep)
      const wantedColor = getVersionColor(current, dep.wanted)
      const latestColor = getVersionColor(current, dep.latest)

      const devSuffix = dep.isDevDependency
        ? `${COLORS.grey} (dev)${COLORS.reset}`
        : ''
      const displayName = dep.isDevDependency
        ? dep.name.padEnd(maxNameLen - 6)
        : dep.name.padEnd(maxNameLen)

      if (showEcosystem) {
        console.log(
          `${displayName}${devSuffix}  ${current.padEnd(maxVersionLen)}  ${wantedColor}${dep.wanted.padEnd(maxVersionLen)}${COLORS.reset}  ${latestColor}${dep.latest.padEnd(maxVersionLen)}${COLORS.reset}  ${dep.ecosystem.padEnd(maxEcosystemLen)}`,
        )
      } else {
        console.log(
          `${displayName}${devSuffix}  ${current.padEnd(maxVersionLen)}  ${wantedColor}${dep.wanted.padEnd(maxVersionLen)}${COLORS.reset}  ${latestColor}${dep.latest.padEnd(maxVersionLen)}${COLORS.reset}`,
        )
      }
    }

    return { success: true, message: 'Outdated dependencies listed.' }
  },
})
