import { execFile } from 'node:child_process'
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { promisify } from 'node:util'
import semver from 'semver'

import { sanitizePackageName } from '../npm/info.ts'

const execFileAsync = promisify(execFile)

/** Cache duration in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000

/** Timeout for listing remote tags */
const LS_REMOTE_TIMEOUT_MS = 30 * 1000

/** Cache directory for GitHub Actions release info */
const getCacheDir = async (): Promise<string> => {
  const cacheDir = `${homedir()}/.cache/denvig/dependencies/actions`
  await mkdir(cacheDir, { recursive: true })
  return cacheDir
}

/** Get cache file path for an action repository */
const getCacheFilePath = async (
  name: string,
  kind: string,
): Promise<string> => {
  return `${await getCacheDir()}/${sanitizePackageName(name)}.${kind}.json`
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

/** Read cached data for an action repository */
const readCache = async <T>(name: string, kind: string): Promise<T | null> => {
  const filePath = await getCacheFilePath(name, kind)
  if (!(await isCacheValid(filePath))) return null
  try {
    return JSON.parse(await readFile(filePath, 'utf-8')) as T
  } catch {
    return null
  }
}

/** Write data for an action repository to cache */
const writeCache = async (
  name: string,
  kind: string,
  data: unknown,
): Promise<void> => {
  try {
    await writeFile(
      await getCacheFilePath(name, kind),
      JSON.stringify(data),
      'utf-8',
    )
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
    const cached = await readCache<GitHubActionInfo>(name, 'releases')
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

    await writeCache(name, 'releases', result)
    return result
  } catch {
    return null
  }
}

/**
 * Map commit SHAs to the most specific semver tag pointing at them, from
 * `git ls-remote --tags` output. Annotated tags use their peeled (`^{}`)
 * commit, so `v7` and `v7.0.1` on the same commit resolve to `7.0.1`.
 */
export const parseTagCommits = (output: string): Record<string, string> => {
  const tagCommits = new Map<string, string>()
  for (const line of output.split('\n')) {
    const [sha, ref] = line.trim().split(/\s+/)
    if (!sha || !ref?.startsWith('refs/tags/')) continue
    const peeled = ref.endsWith('^{}')
    const tag = ref.slice('refs/tags/'.length, peeled ? -3 : undefined)
    if (peeled || !tagCommits.has(tag)) tagCommits.set(tag, sha.toLowerCase())
  }

  const versions: Record<string, string> = {}
  for (const [tag, sha] of tagCommits) {
    const version = semver.clean(tag)
    if (!version) continue
    const existing = versions[sha]
    if (!existing || semver.gt(version, existing)) versions[sha] = version
  }
  return versions
}

/**
 * Fetch a map of commit SHA to semver version for an action repository's
 * tags, used to resolve SHA-pinned references. Uses `git ls-remote` so it
 * does not count towards the GitHub API rate limit.
 */
export const fetchGitHubActionTagCommits = async (
  name: string,
  noCache = false,
): Promise<Record<string, string> | null> => {
  if (!noCache) {
    const cached = await readCache<Record<string, string>>(name, 'tags')
    if (cached) return cached
  }

  try {
    const { stdout } = await execFileAsync(
      'git',
      ['ls-remote', '--tags', `https://github.com/${name}.git`],
      {
        timeout: LS_REMOTE_TIMEOUT_MS,
        env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
      },
    )
    const result = parseTagCommits(stdout)
    await writeCache(name, 'tags', result)
    return result
  } catch {
    return null
  }
}
