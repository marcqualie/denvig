import { DenvigValidationError } from '../lib/errors.ts'
import { parseDuration } from '../lib/formatters/duration.ts'
import { fetchJsrPackageInfo } from '../lib/jsr/info.ts'
import { fetchNpmPackageInfo } from '../lib/npm/info.ts'
import { readPnpmReleaseAgeConfig } from '../lib/pnpm-config.ts'
import { fetchRubygemInfo } from '../lib/rubygems/info.ts'
import { outdatedMatchesSemverFilter } from '../lib/semver.ts'
import { fetchPyPIPackageInfo } from '../lib/uv/info.ts'

import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../lib/dependencies.ts'
import type { Worktree } from '../lib/project/worktree.ts'

export type SemverLevel = 'patch' | 'minor' | 'major'

/** Registry information about a single dependency, across ecosystems. */
export type DependencyInfo = {
  /** Ecosystem the dependency belongs to (e.g. `npm`, `rubygems`). */
  ecosystem: string
  /** Package name within the ecosystem. */
  name: string
  /** Latest version published to the registry, or `null` if unknown. */
  latest: string | null
  /** All known versions, newest-last where the registry preserves order. */
  versions: string[]
  /** ISO publish dates keyed by version, when the registry provides them. */
  versionDates?: Record<string, string>
}

export type DependencyInfoOptions = {
  /** Skip the on-disk cache and fetch fresh data from the registry. */
  noCache?: boolean
}

/** Map an ecosystem to its registry fetcher. */
const REGISTRY_FETCHERS: Record<
  string,
  (name: string, noCache?: boolean) => Promise<DependencyInfo | null>
> = {
  npm: async (name, noCache) => {
    const info = await fetchNpmPackageInfo(name, noCache)
    return info ? { ecosystem: 'npm', name, ...info } : null
  },
  jsr: async (name, noCache) => {
    const info = await fetchJsrPackageInfo(name, noCache)
    return info ? { ecosystem: 'jsr', name, ...info } : null
  },
  pypi: async (name, noCache) => {
    const info = await fetchPyPIPackageInfo(name, noCache)
    return info ? { ecosystem: 'pypi', name, ...info } : null
  },
  rubygems: async (name, noCache) => {
    const info = await fetchRubygemInfo(name, noCache)
    return info ? { ecosystem: 'rubygems', name, ...info } : null
  },
}

/**
 * Resolve registry information for a dependency identified as
 * `<ecosystem>:<name>` (e.g. `npm:redis`, `rubygems:rails`). Returns `null`
 * when the package cannot be found. This is the single consistent entry point
 * behind the per-ecosystem registry fetchers.
 */
export const dependencyInfo = async (
  identifier: string,
  options: DependencyInfoOptions = {},
): Promise<DependencyInfo | null> => {
  const separator = identifier.indexOf(':')
  if (separator <= 0) {
    throw new DenvigValidationError(
      `Invalid dependency identifier "${identifier}". Expected "<ecosystem>:<name>" (e.g. "npm:redis").`,
    )
  }

  const ecosystem = identifier.slice(0, separator)
  const name = identifier.slice(separator + 1)
  const fetcher = REGISTRY_FETCHERS[ecosystem]
  if (!fetcher) {
    throw new DenvigValidationError(
      `Unsupported ecosystem "${ecosystem}". Supported: ${Object.keys(REGISTRY_FETCHERS).join(', ')}.`,
    )
  }
  if (!name) {
    throw new DenvigValidationError(
      `Invalid dependency identifier "${identifier}". Missing package name.`,
    )
  }

  return fetcher(name, options.noCache)
}

export type ListDependenciesOptions = {
  /** Skip cache and fetch fresh data from the registry. */
  cache?: boolean
}

export type OutdatedDependenciesOptions = {
  /** Skip cache and fetch fresh data from the registry. */
  cache?: boolean
  /** Filter by semver level (patch | minor | major). */
  semver?: SemverLevel
  /** Filter to a specific ecosystem (e.g. npm, rubygems, pypi). */
  ecosystem?: string
  /**
   * Only show updates released longer ago than this duration (e.g. "3h",
   * "7d"). "auto" reads pnpm `minimumReleaseAge` (24h fallback); "0" disables.
   * @default 'auto'
   */
  releaseLatency?: string
}

/**
 * List all dependencies detected for a worktree.
 */
export const listDependencies = (
  worktree: Worktree,
): Promise<ProjectDependencySchema[]> => worktree.dependencies()

const getCurrent = (dep: OutdatedDependencySchema): string =>
  dep.versions[0]?.resolved || ''

/**
 * Resolve outdated dependencies, applying ecosystem, semver-level and
 * release-latency filters. This is the shared data path behind both
 * `denvig deps outdated` and `sdk.deps.outdated()`.
 */
export const outdatedDependencies = async (
  worktree: Worktree,
  options: OutdatedDependenciesOptions = {},
): Promise<OutdatedDependencySchema[]> => {
  const { semver: semverFilter, ecosystem: ecosystemFilter } = options
  const cache = options.cache ?? true

  if (
    semverFilter &&
    semverFilter !== 'patch' &&
    semverFilter !== 'minor' &&
    semverFilter !== 'major'
  ) {
    throw new DenvigValidationError(
      `Invalid semver value: "${semverFilter}". Must be "patch", "minor", or "major".`,
    )
  }

  let entries = await worktree.outdatedDependencies({ cache })

  if (ecosystemFilter) {
    entries = entries.filter((dep) => dep.ecosystem === ecosystemFilter)
  }

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

  // Resolve release latency threshold.
  let releaseLatencyMs: number | null = null
  let releaseLatencyExclude: string[] = []
  const latencyValue = options.releaseLatency ?? 'auto'
  if (latencyValue === '0') {
    releaseLatencyMs = null
  } else if (latencyValue === 'auto') {
    const pnpmConfig = await readPnpmReleaseAgeConfig(worktree.path)
    if (pnpmConfig) {
      releaseLatencyMs = pnpmConfig.minimumReleaseAgeMs
      releaseLatencyExclude = pnpmConfig.exclude
    } else {
      releaseLatencyMs = 24 * 60 * 60 * 1000
    }
  } else {
    releaseLatencyMs = parseDuration(latencyValue)
    if (releaseLatencyMs === null) {
      throw new DenvigValidationError(
        `Invalid releaseLatency value: "${latencyValue}". Use a duration like "3h", "7d", "2w", or "auto".`,
      )
    }
  }

  if (releaseLatencyMs !== null) {
    const threshold = releaseLatencyMs
    const now = Date.now()
    entries = entries.filter((dep) => {
      if (releaseLatencyExclude.includes(dep.name)) return true

      const current = getCurrent(dep)
      const wantedIsUpdate = dep.wanted !== current
      const latestIsUpdate = dep.latest !== current

      const wantedOldEnough =
        wantedIsUpdate && dep.wantedDate
          ? now - new Date(dep.wantedDate).getTime() >= threshold
          : false
      const latestOldEnough =
        latestIsUpdate && dep.latestDate
          ? now - new Date(dep.latestDate).getTime() >= threshold
          : false

      const hasDateInfo =
        (wantedIsUpdate && dep.wantedDate) || (latestIsUpdate && dep.latestDate)
      if (!hasDateInfo) return true

      return wantedOldEnough || latestOldEnough
    })
  }

  return entries.sort((a, b) => {
    const ecosystemCompare = a.ecosystem.localeCompare(b.ecosystem)
    if (ecosystemCompare !== 0) return ecosystemCompare
    return a.name.localeCompare(b.name)
  })
}
