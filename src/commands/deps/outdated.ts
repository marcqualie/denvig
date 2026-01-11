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

export const depsOutdatedCommand = new Command({
  name: 'deps:outdated',
  description: 'Show outdated dependencies',
  usage: 'deps:outdated',
  example: 'denvig deps:outdated',
  args: [],
  flags: [],
  handler: async ({ project }) => {
    const outdated = await project.outdatedDependencies()
    const entries = Object.entries(outdated)

    if (entries.length === 0) {
      console.log('All dependencies are up to date!')
      return { success: true, message: 'All dependencies up to date.' }
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
