import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

import { parseDuration } from './formatters/duration.ts'

type PnpmWorkspaceConfig = {
  minimumReleaseAge?: number | string
}

/**
 * Read the minimumReleaseAge from pnpm-workspace.yaml and return it as milliseconds.
 * Returns null if the file doesn't exist or the setting isn't configured.
 * pnpm stores this value as minutes (e.g., 1440 = 24 hours).
 */
export const readPnpmMinimumReleaseAge = async (
  projectPath: string,
): Promise<number | null> => {
  try {
    const content = await readFile(
      `${projectPath}/pnpm-workspace.yaml`,
      'utf-8',
    )
    const config = parse(content) as PnpmWorkspaceConfig
    if (config?.minimumReleaseAge == null) return null

    const value = String(config.minimumReleaseAge)
    return parseDuration(value)
  } catch {
    return null
  }
}
