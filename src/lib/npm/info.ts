import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'

/** Cache duration in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000

/** Cache directory for npm package info */
const getCacheDir = (): string => {
  const cacheDir = `${homedir()}/.cache/denvig/dependencies/npm`
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

/**
 * Sanitize a package name into a safe filename.
 * Only allows ASCII alphanumeric, hyphen, underscore, and dot.
 * All other characters are replaced with safe equivalents.
 */
export const sanitizePackageName = (packageName: string): string => {
  // Replace common npm package patterns first
  let safe = packageName.replace(/@/g, '_at_').replace(/\//g, '__')

  // Replace any remaining unsafe characters with underscore
  // Only allow: a-z, A-Z, 0-9, hyphen, underscore, dot
  safe = safe.replace(/[^a-zA-Z0-9\-_.]/g, '_')

  // Prevent path traversal and hidden files
  safe = safe.replace(/\.{2,}/g, '_') // Replace consecutive dots
  safe = safe.replace(/^\.+/, '_') // Replace leading dots

  // Ensure non-empty
  if (safe.length === 0) {
    safe = '_empty_'
  }

  // Truncate to reasonable length (255 is common filesystem limit, leave room for .json)
  if (safe.length > 200) {
    safe = safe.slice(0, 200)
  }

  return safe
}

/** Get cache file path for a package */
export const getCacheFilePath = (packageName: string): string => {
  const safeFileName = sanitizePackageName(packageName)
  return `${getCacheDir()}/${safeFileName}.json`
}

/** Check if cache file is still valid (less than 30 minutes old) */
const isCacheValid = (filePath: string): boolean => {
  try {
    const stats = statSync(filePath)
    const age = Date.now() - stats.mtimeMs
    return age < CACHE_DURATION_MS
  } catch {
    return false
  }
}

export type NpmPackageInfo = {
  versions: string[]
  latest: string
}

/** Read cached package info */
const readCache = (packageName: string): NpmPackageInfo | null => {
  const filePath = getCacheFilePath(packageName)
  if (!existsSync(filePath) || !isCacheValid(filePath)) {
    return null
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as NpmPackageInfo
  } catch {
    return null
  }
}

/** Write package info to cache */
const writeCache = (packageName: string, data: NpmPackageInfo): void => {
  try {
    const filePath = getCacheFilePath(packageName)
    writeFileSync(filePath, JSON.stringify(data), 'utf-8')
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch package info from npm registry with caching.
 */
export const fetchNpmPackageInfo = async (
  packageName: string,
  noCache = false,
): Promise<NpmPackageInfo | null> => {
  // Try to read from cache first (unless noCache is set)
  if (!noCache) {
    const cached = readCache(packageName)
    if (cached) {
      return cached
    }
  }

  try {
    const response = await fetch(
      `https://registry.npmjs.com/${encodeURIComponent(packageName)}`,
      { headers: { Accept: 'application/json' } },
    )
    if (!response.ok) return null

    const data = (await response.json()) as {
      versions: Record<string, unknown>
      'dist-tags': { latest: string }
    }

    const versions = Object.keys(data.versions)
    const latest = data['dist-tags']?.latest || versions[versions.length - 1]

    const result = { versions, latest }

    // Write to cache
    writeCache(packageName, result)

    return result
  } catch {
    return null
  }
}
