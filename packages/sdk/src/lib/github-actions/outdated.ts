import semver from 'semver'

import { filterDependenciesByDepth } from '../deps/tree.ts'
import { fetchGitHubActionInfo } from './info.ts'

import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../dependencies.ts'
import type { OutdatedDependenciesOptions } from '../plugin.ts'
import type { GitHubActionInfo } from './info.ts'

/**
 * Compare a GitHub Action dependency against its releases. Floating tags such
 * as `v6` resolve to the newest matching release, which is also the wanted
 * version. Returns `null` when there is nothing newer.
 */
export const resolveOutdatedAction = (
  dep: ProjectDependencySchema,
  info: GitHubActionInfo,
): OutdatedDependencySchema | null => {
  const first = dep.versions[0]
  if (!first) return null

  const specifier = first.specifier
  const current = semver.maxSatisfying(info.versions, specifier)
  if (!current) return null

  const wanted = current
  const latest = info.latest
  if (!semver.gt(latest, current)) return null

  return {
    ...dep,
    versions: dep.versions.map((v) =>
      v.specifier === specifier ? { ...v, resolved: current } : v,
    ),
    wanted,
    latest,
    specifier,
    isDevDependency: false,
    currentDate: info.versionDates?.[current],
    wantedDate: info.versionDates?.[wanted],
    latestDate: info.versionDates?.[latest],
  }
}

/**
 * Check GitHub Actions for outdated versions using GitHub releases.
 */
export const githubActionsOutdated = async (
  dependencies: ProjectDependencySchema[],
  options: OutdatedDependenciesOptions = {},
): Promise<OutdatedDependencySchema[]> => {
  const useCache = options.cache ?? true
  const toCheck = filterDependenciesByDepth(dependencies, 0)

  const results = await Promise.all(
    toCheck.map(async (dep) => {
      const info = await fetchGitHubActionInfo(dep.name, !useCache)
      return info ? resolveOutdatedAction(dep, info) : null
    }),
  )

  return results.filter((dep) => dep !== null)
}
