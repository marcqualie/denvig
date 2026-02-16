import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'

import { sanitizePackageName } from '../npm/info.ts'

/** Cache duration in milliseconds */
const CACHE_DURATION_MS = 60 * 60 * 1000

/** Cache directory for JSR package info */
const getCacheDir = (): string => {
  const cacheDir = `${homedir()}/.cache/denvig/dependencies/jsr`
  if (!existsSync(cacheDir)) {
    mkdirSync(cacheDir, { recursive: true })
  }
  return cacheDir
}

/** Get cache file path for a package */
const getCacheFilePath = (packageName: string): string => {
  const safeFileName = sanitizePackageName(packageName)
  return `${getCacheDir()}/${safeFileName}.json`
}

/** Check if cache file is still valid */
const isCacheValid = (filePath: string): boolean => {
  try {
    const stats = statSync(filePath)
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
const readCache = (packageName: string): JsrPackageInfo | null => {
  const filePath = getCacheFilePath(packageName)
  if (!existsSync(filePath) || !isCacheValid(filePath)) {
    return null
  }
  try {
    const content = readFileSync(filePath, 'utf-8')
    return JSON.parse(content) as JsrPackageInfo
  } catch {
    return null
  }
}

/** Write package info to cache */
const writeCache = (packageName: string, data: JsrPackageInfo): void => {
  try {
    const filePath = getCacheFilePath(packageName)
    writeFileSync(filePath, JSON.stringify(data), 'utf-8')
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
    const cached = readCache(packageName)
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
    writeCache(packageName, result)

    return result
  } catch {
    return null
  }
}
