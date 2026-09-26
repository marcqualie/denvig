import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import semver from 'semver'

import { sanitizePackageName } from '../npm/info.ts'

/** Cache duration in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000

/** Cache directory for GitHub Actions release info */
const getCacheDir = async (): Promise<string> => {
  const cacheDir = `${homedir()}/.cache/denvig/dependencies/actions`
  await mkdir(cacheDir, { recursive: true })
  return cacheDir
}

/** Get cache file path for an action repository */
const getCacheFilePath = async (name: string): Promise<string> => {
  return `${await getCacheDir()}/${sanitizePackageName(name)}.json`
}

/** Check if cache file is still valid */
const isCacheValid = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath)
    return Date.now() - stats.mtimeMs < CACHE_DURATION_MS
  } catch {
    return false
  }
}

export type GitHubActionInfo = {
  versions: string[]
  latest: string
  versionDates?: Record<string, string>
}

type GitHubRelease = {
  tag_name: string
  draft: boolean
  prerelease: boolean
  published_at: string | null
}

/** Read cached action info */
const readCache = async (name: string): Promise<GitHubActionInfo | null> => {
  const filePath = await getCacheFilePath(name)
  if (!(await isCacheValid(filePath))) return null
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as GitHubActionInfo
  } catch {
    return null
  }
}

/** Write action info to cache */
const writeCache = async (
  name: string,
  data: GitHubActionInfo,
): Promise<void> => {
  try {
    await writeFile(await getCacheFilePath(name), JSON.stringify(data), 'utf-8')
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Convert GitHub releases into semver versions (newest last). Drafts and
 * tags that are not valid semver (after stripping a `v` prefix) are ignored.
 */
export const parseReleases = (
  releases: GitHubRelease[],
): GitHubActionInfo | null => {
  const versionDates: Record<string, string> = {}
  const stable: string[] = []
  const versions: string[] = []

  for (const release of releases) {
    if (release.draft) continue
    const version = semver.clean(release.tag_name)
    if (!version) continue
    versions.push(version)
    if (!release.prerelease && !semver.prerelease(version)) {
      stable.push(version)
    }
    if (release.published_at) versionDates[version] = release.published_at
  }

  if (versions.length === 0) return null

  versions.sort(semver.compare)
  const latest = semver.maxSatisfying(stable, '*') ?? versions.at(-1) ?? ''

  return { versions, latest, versionDates }
}

/**
 * Fetch release info for an action repository (e.g. `actions/checkout`) from
 * the GitHub API with caching. Uses `GITHUB_TOKEN` or `GH_TOKEN` when set to
 * avoid the low unauthenticated rate limit.
 */
export const fetchGitHubActionInfo = async (
  name: string,
  noCache = false,
): Promise<GitHubActionInfo | null> => {
  if (!noCache) {
    const cached = await readCache(name)
    if (cached) return cached
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  if (token) headers.Authorization = `Bearer ${token}`

  try {
    const response = await fetch(
      `https://api.github.com/repos/${name}/releases?per_page=100`,
      { headers },
    )
    if (!response.ok) return null

    const result = parseReleases((await response.json()) as GitHubRelease[])
    if (!result) return null

    await writeCache(name, result)
    return result
  } catch {
    return null
  }
}
