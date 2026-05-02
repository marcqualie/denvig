import { countCertsExpiringWithin } from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'
import { parseDuration } from '../../lib/formatters/duration.ts'
import { relativeFormattedTime } from '../../lib/formatters/relative-time.ts'
import { COLORS, formatTable, hyperlink } from '../../lib/formatters/table.ts'
import { readPnpmReleaseAgeConfig } from '../../lib/pnpm-config.ts'
import {
  getSemverLevel,
  outdatedMatchesSemverFilter,
} from '../../lib/semver.ts'

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
        'Only show updates released longer ago than this duration (e.g., "3h", "7d", "2w"). Use "auto" to read from pnpm minimumReleaseAge, or "0" to disable.',
      required: false,
      type: 'string',
      defaultValue: 'auto',
    },
  ],
  handler: async ({ project, flags }) => {
    const cache = !(flags['no-cache'] as boolean)
    const semverFilter = flags.semver as 'patch' | 'minor' | 'major' | undefined
    const ecosystemFilter = flags.ecosystem as string | undefined
    const releaseLatencyFlag = flags['release-latency'] as string | undefined

    // Validate semver flag
    if (
      semverFilter &&
      semverFilter !== 'patch' &&
      semverFilter !== 'minor' &&
      semverFilter !== 'major'
    ) {
      console.error(
        `Invalid --semver value: "${semverFilter}". Must be "patch", "minor", or "major".`,
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

    // Filter by semver level if specified. We check both `wanted` and
    // `latest` so that a patch-level update is still detected even when a
    // higher minor/major version exists alongside it (see issue #154).
    if (semverFilter) {
      entries = entries.filter((dep) =>
        outdatedMatchesSemverFilter(
          {
            currentVersion: getCurrent(dep),
            wantedVersion: dep.wanted,
            latestVersion: dep.latest,
          },
          semverFilter,
        ),
      )
    }

    // Resolve release latency threshold
    let releaseLatencyMs: number | null = null
    let releaseLatencyExclude: string[] = []
    const latencyValue = releaseLatencyFlag ?? 'auto'
    if (latencyValue === '0') {
      // Explicitly disabled
      releaseLatencyMs = null
    } else if (latencyValue === 'auto') {
      // Read from pnpm-workspace.yaml if available
      const pnpmConfig = await readPnpmReleaseAgeConfig(project.path)
      if (pnpmConfig) {
        releaseLatencyMs = pnpmConfig.minimumReleaseAgeMs
        releaseLatencyExclude = pnpmConfig.exclude
      }
    } else {
      releaseLatencyMs = parseDuration(latencyValue)
      if (releaseLatencyMs === null) {
        console.error(
          `Invalid --release-latency value: "${latencyValue}". Use a duration like "3h", "7d", "2w", or "auto".`,
        )
        return { success: false, message: 'Invalid --release-latency value.' }
      }
    }

    // Filter by release latency: hide entries where all update versions
    // were released more recently than the threshold
    if (releaseLatencyMs !== null) {
      const now = Date.now()
      entries = entries.filter((dep) => {
        // Skip filtering for excluded packages
        if (releaseLatencyExclude.includes(dep.name)) return true

        const current = getCurrent(dep)
        const wantedIsUpdate = dep.wanted !== current
        const latestIsUpdate = dep.latest !== current

        // Check if wanted version is old enough
        const wantedOldEnough =
          wantedIsUpdate && dep.wantedDate
            ? now - new Date(dep.wantedDate).getTime() >= releaseLatencyMs
            : false

        // Check if latest version is old enough
        const latestOldEnough =
          latestIsUpdate && dep.latestDate
            ? now - new Date(dep.latestDate).getTime() >= releaseLatencyMs
            : false

        // Keep if any available update is old enough, or if dates are missing
        // (we don't filter out entries with unknown release dates)
        const hasDateInfo =
          (wantedIsUpdate && dep.wantedDate) ||
          (latestIsUpdate && dep.latestDate)
        if (!hasDateInfo) return true

        return wantedOldEnough || latestOldEnough
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
