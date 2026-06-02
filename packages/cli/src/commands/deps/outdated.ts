import { countCertsExpiringWithin } from '@denvig/sdk/lib/certs.ts'
import { DenvigValidationError } from '@denvig/sdk/lib/errors.ts'
import { getSemverLevel } from '@denvig/sdk/lib/semver.ts'
import { outdatedDependencies } from '@denvig/sdk/operations/deps.ts'

import { Command } from '../../lib/command.ts'
import { relativeFormattedTime } from '../../lib/formatters/relative-time.ts'
import { COLORS, formatTable, hyperlink } from '../../lib/formatters/table.ts'

const ONE_WEEK_MS = 7 * 24 * 60 * 60 * 1000

const printExpiringCertsWarning = (): void => {
  const count = countCertsExpiringWithin(ONE_WEEK_MS)
  if (count === 0) return
  const noun = count === 1 ? 'certificate is' : 'certificates are'
  console.log('')
  console.log(
    `${COLORS.yellow}${count} ${noun} due to expire. Run denvig certs for details.${COLORS.reset}`,
  )
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

  const level = getSemverLevel(current, target)
  if (!level) return COLORS.white

  if (level === 'major') return COLORS.red
  if (level === 'minor') return COLORS.yellow
  if (level === 'patch') return COLORS.green

  return COLORS.white
}

/** Get a URL for a specific package version based on ecosystem. */
const getVersionUrl = (
  name: string,
  version: string,
  ecosystem: string,
): string | null => {
  const via = process.env.DENVIG_OPEN_VIA || 'npm'
  if (via === 'none') return null
  if (ecosystem === 'npm') {
    if (via === 'npmx') {
      return `https://npmx.dev/package/${name}/v/${version}`
    }
    return `https://www.npmjs.com/package/${name}/v/${version}`
  }
  return null
}

export const depsOutdatedCommand = new Command({
  name: 'deps:outdated',
  description: 'Show outdated dependencies',
  usage:
    'deps outdated [--no-cache] [--semver patch|minor|major] [--ecosystem <name>] [--release-latency <duration>]',
  example: 'denvig deps outdated --release-latency 7d',
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
        'Filter by semver level: "patch" for patch updates only, "minor" for minor and patch updates, "major" for major updates only',
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
    {
      name: 'release-latency',
      description:
        'Only show updates released longer ago than this duration (e.g., "3h", "7d", "2w"). Use "auto" to read from pnpm minimumReleaseAge with a 24h fallback, or "0" to disable.',
      required: false,
      type: 'string',
      defaultValue: 'auto',
    },
  ],
  handler: async ({ worktree, flags }) => {
    const cache = !(flags['no-cache'] as boolean)
    const semverFilter = flags.semver as 'patch' | 'minor' | 'major' | undefined
    const ecosystemFilter = flags.ecosystem as string | undefined
    const releaseLatencyFlag = flags['release-latency'] as string | undefined

    // Helper to get current version from versions array
    const getCurrent = (dep: { versions: { resolved: string }[] }) =>
      dep.versions[0]?.resolved || ''

    let sortedEntries: Awaited<ReturnType<typeof outdatedDependencies>>
    try {
      sortedEntries = await outdatedDependencies(worktree, {
        cache,
        semver: semverFilter,
        ecosystem: ecosystemFilter,
        releaseLatency: releaseLatencyFlag,
      })
    } catch (e) {
      if (e instanceof DenvigValidationError) {
        console.error(e.message)
        return { success: false, message: e.message }
      }
      throw e
    }
    const entries = sortedEntries

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
        printExpiringCertsWarning()
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

    // JSON output (entries are already filtered and sorted by the operation)
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
        {
          header: 'Current',
          accessor: (dep) => {
            if (dep.currentDate) {
              return `${getCurrent(dep)} (${relativeFormattedTime(dep.currentDate)})`
            }
            return getCurrent(dep)
          },
          format: (value, dep) => {
            const current = getCurrent(dep)
            const url = getVersionUrl(dep.name, current, dep.ecosystem)
            if (dep.currentDate) {
              const versionEnd = value.indexOf(' (')
              const versionPart = value.slice(0, versionEnd)
              const rest = value.slice(versionEnd)
              const linked = url ? hyperlink(versionPart, url) : versionPart
              return `${linked}${COLORS.grey}${rest}${COLORS.reset}`
            }
            return url
              ? hyperlink(value.trimEnd(), url) +
                  value.slice(value.trimEnd().length)
              : value
          },
        },
        {
          header: 'Wanted',
          accessor: (dep) => {
            if (dep.wanted === getCurrent(dep)) return '-'
            if (dep.wantedDate) {
              return `${dep.wanted} (${relativeFormattedTime(dep.wantedDate)})`
            }
            return dep.wanted
          },
          format: (value, dep) => {
            if (value.trimEnd() === '-') return value
            const color = getVersionColor(getCurrent(dep), dep.wanted)
            const url = getVersionUrl(dep.name, dep.wanted, dep.ecosystem)
            if (dep.wantedDate) {
              const versionEnd = value.indexOf(' (')
              const versionPart = value.slice(0, versionEnd)
              const rest = value.slice(versionEnd)
              const linked = url
                ? hyperlink(`${color}${versionPart}${COLORS.reset}`, url)
                : `${color}${versionPart}${COLORS.reset}`
              return `${linked}${COLORS.grey}${rest}${COLORS.reset}`
            }
            const linked = url
              ? hyperlink(`${color}${value.trimEnd()}${COLORS.reset}`, url)
              : `${color}${value}${COLORS.reset}`
            return url ? linked + value.slice(value.trimEnd().length) : linked
          },
        },
        {
          header: 'Latest',
          accessor: (dep) => {
            if (dep.latestDate) {
              return `${dep.latest} (${relativeFormattedTime(dep.latestDate)})`
            }
            return dep.latest
          },
          format: (value, dep) => {
            const color = getVersionColor(getCurrent(dep), dep.latest)
            const url = getVersionUrl(dep.name, dep.latest, dep.ecosystem)
            if (dep.latestDate) {
              const versionEnd = value.indexOf(' (')
              const versionPart = value.slice(0, versionEnd)
              const rest = value.slice(versionEnd)
              const linked = url
                ? hyperlink(`${color}${versionPart}${COLORS.reset}`, url)
                : `${color}${versionPart}${COLORS.reset}`
              return `${linked}${COLORS.grey}${rest}${COLORS.reset}`
            }
            const linked = url
              ? hyperlink(`${color}${value.trimEnd()}${COLORS.reset}`, url)
              : `${color}${value}${COLORS.reset}`
            return url ? linked + value.slice(value.trimEnd().length) : linked
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

    printExpiringCertsWarning()

    return { success: true, message: 'Outdated dependencies listed.' }
  },
})
