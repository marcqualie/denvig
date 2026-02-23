import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'

/** Cache duration in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000

/** Cache directory for rubygems package info */
const getCacheDir = async (): Promise<string> => {
  const cacheDir = `${homedir()}/.cache/denvig/dependencies/rubygems`
  await mkdir(cacheDir, { recursive: true })
  return cacheDir
}

/**
 * Sanitize a gem name into a safe filename.
 * Only allows ASCII alphanumeric, hyphen, underscore, and dot.
 */
export const sanitizeGemName = (gemName: string): string => {
  // Replace any unsafe characters with underscore
  let safe = gemName.replace(/[^a-zA-Z0-9\-_.]/g, '_')

  // Prevent path traversal and hidden files
  safe = safe.replace(/\.{2,}/g, '_') // Replace consecutive dots
  safe = safe.replace(/^\.+/, '_') // Replace leading dots

  // Ensure non-empty
  if (safe.length === 0) {
    safe = '_empty_'
  }

  // Truncate to reasonable length
  if (safe.length > 200) {
    safe = safe.slice(0, 200)
  }

  return safe
}

/** Get cache file path for a gem */
export const getCacheFilePath = async (gemName: string): Promise<string> => {
  const safeFileName = sanitizeGemName(gemName)
  return `${await getCacheDir()}/${safeFileName}.json`
}

/** Check if cache file is still valid (less than 30 minutes old) */
const isCacheValid = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath)
    const age = Date.now() - stats.mtimeMs
    return age < CACHE_DURATION_MS
  } catch {
    return false
  }
}

export type RubygemInfo = {
  versions: string[]
  latest: string
}

/** Read cached gem info */
const readCache = async (gemName: string): Promise<RubygemInfo | null> => {
  const filePath = await getCacheFilePath(gemName)
  if (!(await isCacheValid(filePath))) {
    return null
  }
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as RubygemInfo
  } catch {
    return null
  }
}

/** Write gem info to cache */
const writeCache = async (
  gemName: string,
  data: RubygemInfo,
): Promise<void> => {
  try {
    const filePath = await getCacheFilePath(gemName)
    await writeFile(filePath, JSON.stringify(data), 'utf-8')
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch gem info from RubyGems.org API with caching.
 * Uses the versions endpoint to get all available versions.
 */
export const fetchRubygemInfo = async (
  gemName: string,
  noCache = false,
): Promise<RubygemInfo | null> => {
  // Try to read from cache first (unless noCache is set)
  if (!noCache) {
    const cached = await readCache(gemName)
    if (cached) {
      return cached
    }
  }

  try {
    // Fetch all versions from the versions API
    const response = await fetch(
      `https://rubygems.org/api/v1/versions/${encodeURIComponent(gemName)}.json`,
      { headers: { Accept: 'application/json' } },
    )
    if (!response.ok) return null

    const data = (await response.json()) as Array<{
      number: string
      prerelease: boolean
    }>

    // Extract version numbers, filtering out prereleases for the versions list
    const allVersions = data.map((v) => v.number)

    // Find latest stable version (non-prerelease)
    const stableVersions = data
      .filter((v) => !v.prerelease)
      .map((v) => v.number)
    const latest = stableVersions[0] || allVersions[0]

    const result = { versions: allVersions, latest }

    // Write to cache
    await writeCache(gemName, result)

    return result
  } catch {
    return null
  }
}
