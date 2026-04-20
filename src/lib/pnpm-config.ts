import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

import { parseDuration } from './formatters/duration.ts'

type PnpmWorkspaceConfig = {
  minimumReleaseAge?: number | string
  minimumReleaseAgeExclude?: string[]
}

export type PnpmReleaseAgeConfig = {
  minimumReleaseAgeMs: number
  exclude: string[]
}

/**
 * Read release age configuration from pnpm-workspace.yaml.
 * Returns the minimumReleaseAge as milliseconds and the exclude list.
 * Returns null if the file doesn't exist or the setting isn't configured.
 * pnpm stores the age value as minutes (e.g., 1440 = 24 hours).
 */
export const readPnpmReleaseAgeConfig = async (
  projectPath: string,
): Promise<PnpmReleaseAgeConfig | null> => {
  try {
    const content = await readFile(
      `${projectPath}/pnpm-workspace.yaml`,
      'utf-8',
    )
    const config = parse(content) as PnpmWorkspaceConfig
    if (config?.minimumReleaseAge == null) return null

    const value = String(config.minimumReleaseAge)
    const ms = parseDuration(value)
    if (ms === null) return null

    return {
      minimumReleaseAgeMs: ms,
      exclude: config.minimumReleaseAgeExclude ?? [],
    }
  } catch {
    return null
  }
}
