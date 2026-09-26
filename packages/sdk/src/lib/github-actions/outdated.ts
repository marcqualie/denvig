import semver from 'semver'

import { filterDependenciesByDepth } from '../deps/tree.ts'
import { fetchGitHubActionInfo, fetchGitHubActionTagCommits } from './info.ts'
import { SHA_PATTERN } from './parse.ts'

import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from '../dependencies.ts'
import type { OutdatedDependenciesOptions } from '../plugin.ts'
import type { GitHubActionInfo } from './info.ts'

/**
 * Compare a GitHub Action dependency against its releases. Floating tags such
 * as `v6` resolve to the newest matching release, and commit SHA pins resolve
 * to the tag pointing at that commit. The current version is also the wanted
 * version. Returns `null` when there is nothing newer or it can't be resolved.
 */
export const resolveOutdatedAction = (
  dep: ProjectDependencySchema,
  info: GitHubActionInfo,
  tagCommits: Record<string, string> = {},
): OutdatedDependencySchema | null => {
  const first = dep.versions[0]
  if (!first) return null

  const specifier = first.specifier
  const current = SHA_PATTERN.test(specifier)
    ? tagCommits[specifier]
    : semver.maxSatisfying(info.versions, specifier)
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
      if (!info) return null
      const isPinned = SHA_PATTERN.test(dep.versions[0]?.specifier ?? '')
      const tagCommits = isPinned
        ? await fetchGitHubActionTagCommits(dep.name, !useCache)
        : null
      return resolveOutdatedAction(dep, info, tagCommits ?? {})
    }),
  )

  return results.filter((dep) => dep !== null)
}
