import { mkdir, readFile, stat, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'

import { sanitizePackageName } from '../npm/info.ts'

/** Cache duration in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000

/** Cache directory for JSR package info */
const getCacheDir = async (): Promise<string> => {
  const cacheDir = `${homedir()}/.cache/denvig/dependencies/jsr`
  await mkdir(cacheDir, { recursive: true })
  return cacheDir
}

/** Get cache file path for a package */
const getCacheFilePath = async (packageName: string): Promise<string> => {
  const safeFileName = sanitizePackageName(packageName)
  return `${await getCacheDir()}/${safeFileName}.json`
}

/** Check if cache file is still valid */
const isCacheValid = async (filePath: string): Promise<boolean> => {
  try {
    const stats = await stat(filePath)
    const age = Date.now() - stats.mtimeMs
    return age < CACHE_DURATION_MS
  } catch {
    return false
  }
}

export type JsrPackageInfo = {
  versions: string[]
  latest: string
}

/** Read cached package info */
const readCache = async (
  packageName: string,
): Promise<JsrPackageInfo | null> => {
  const filePath = await getCacheFilePath(packageName)
  if (!(await isCacheValid(filePath))) {
    return null
  }
  try {
    const content = await readFile(filePath, 'utf-8')
    return JSON.parse(content) as JsrPackageInfo
  } catch {
    return null
  }
}

/** Write package info to cache */
const writeCache = async (
  packageName: string,
  data: JsrPackageInfo,
): Promise<void> => {
  try {
    const filePath = await getCacheFilePath(packageName)
    await writeFile(filePath, JSON.stringify(data), 'utf-8')
  } catch {
    // Ignore cache write errors
  }
}

/**
 * Fetch package info from JSR registry with caching.
 * Package name should be in the format "@scope/name" (e.g., "@std/assert").
 */
export const fetchJsrPackageInfo = async (
  packageName: string,
  noCache = false,
): Promise<JsrPackageInfo | null> => {
  if (!noCache) {
    const cached = await readCache(packageName)
    if (cached) {
      return cached
    }
  }

  try {
    const response = await fetch(`https://jsr.io/${packageName}/meta.json`, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null

    const data = (await response.json()) as {
      latest: string
      versions: Record<string, { yanked?: boolean }>
    }

    const versions = Object.entries(data.versions)
      .filter(([_, info]) => !info.yanked)
      .map(([version]) => version)
    const latest = data.latest

    const result = { versions, latest }
    await writeCache(packageName, result)

    return result
  } catch {
    return null
  }
}
