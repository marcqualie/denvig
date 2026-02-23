import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'

/** Cache duration in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000

/** Cache directory for PyPI package info */
const getCacheDir = async (): Promise<string> => {
  const cacheDir = `${homedir()}/.cache/denvig/dependencies/pypi`
  await mkdir(cacheDir, { recursive: true })
  return cacheDir
}

/**
 * Normalize a Python package name for use as a filename
 * PEP 503 normalization
 */
export const sanitizePackageName = (packageName: string): string => {
  // Normalize per PEP 503
  let safe = packageName.toLowerCase().replace(/[-_.]+/g, '-')

  // Replace any remaining unsafe characters with underscore
  safe = safe.replace(/[^a-zA-Z0-9-]/g, '_')

  // Prevent path traversal and hidden files
  safe = safe.replace(/\.{2,}/g, '_')
  safe = safe.replace(/^\.+/, '_')

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

/** Get cache file path for a package */
export const getCacheFilePath = async (
  packageName: string,
): Promise<string> => {
  const safeFileName = sanitizePackageName(packageName)
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

export type PyPIPackageInfo = {
  versions: string[]
  latest: string
}

/** Read cached package info */
const readCache = async (
  packageName: string,
): Promise<PyPIPackageInfo | null> => {
  const filePath = await getCacheFilePath(packageName)
  if (!(await isCacheValid(filePath))) {
    return null
  }
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as PyPIPackageInfo
  } catch {
    return null
  }
}

/** Write package info to cache */
const writeCache = async (
  packageName: string,
  data: PyPIPackageInfo,
): Promise<void> => {
  try {
    const filePath = await getCacheFilePath(packageName)
    await writeFile(filePath, JSON.stringify(data), 'utf-8')
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch package info from PyPI with caching.
 * Uses the JSON API endpoint.
 */
export const fetchPyPIPackageInfo = async (
  packageName: string,
  noCache = false,
): Promise<PyPIPackageInfo | null> => {
  // Normalize package name for PyPI API
  const normalizedName = packageName.toLowerCase().replace(/_/g, '-')

  // Try to read from cache first (unless noCache is set)
  if (!noCache) {
    const cached = await readCache(normalizedName)
    if (cached) {
      return cached
    }
  }

  try {
    const response = await fetch(
      `https://pypi.org/pypi/${encodeURIComponent(normalizedName)}/json`,
      { headers: { Accept: 'application/json' } },
    )
    if (!response.ok) return null

    const data = (await response.json()) as {
      releases: Record<string, unknown[]>
      info: { version: string }
    }

    // Get all versions, filtering out those with no files (yanked or empty)
    const versions = Object.entries(data.releases)
      .filter(([, files]) => files.length > 0)
      .map(([version]) => version)

    const latest = data.info?.version || versions[versions.length - 1]

    const result = { versions, latest }

    // Write to cache
    await writeCache(normalizedName, result)

    return result
  } catch {
    return null
  }
}
