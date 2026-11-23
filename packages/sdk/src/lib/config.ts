import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { parse } from 'yaml'

import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'
import { isPlainObject, mergeConfig } from './mergeConfig.ts'
import { safeReadTextFile } from './safeReadFile.ts'

/**
 * Global config file location
 */
const GLOBAL_CONFIG_PATH = resolve(`${process.env.HOME}/.denvig/config.yml`)

const DEFAULT_GLOBAL_CONFIG = {
  projectPaths: ['~/src/*/*', '~/.dotfiles'],
  quickActions: undefined,
} satisfies Partial<GlobalConfigSchema>

export type ConfigWithSourcePaths<C> = C & {
  $sources: string[]
}

/**
 * Expand ~ to home directory in a path.
 */
export const expandTilde = (path: string): string => {
  if (path.startsWith('~/')) {
    return `${process.env.HOME}${path.slice(1)}`
  }
  return path
}

/**
 * Parse environment variable overrides for global config.
 * Returns only the fields that are set via environment variables.
 */
export const getEnvOverrides = (): Partial<GlobalConfigSchema> => {
  const overrides: Partial<GlobalConfigSchema> = {}

  const projectPaths = process.env.DENVIG_PROJECT_PATHS
  if (projectPaths !== undefined) {
    overrides.projectPaths = projectPaths
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p.length > 0)
  }

  const quickActions = process.env.DENVIG_QUICK_ACTIONS
  if (quickActions !== undefined) {
    // Empty string disables quick actions
    if (quickActions === '') {
      overrides.quickActions = []
    } else {
      overrides.quickActions = quickActions
        .split(',')
        .map((a) => a.trim())
        .filter((a) => a.length > 0)
    }
  }

  return overrides
}

/**
 * Build the global config from raw config text content.
 */
const buildGlobalConfig = (
  configRaw: string | null,
  configPath: string,
): ConfigWithSourcePaths<GlobalConfigSchema> => {
  const sources: string[] = []
  let mergedConfig: Partial<GlobalConfigSchema> = {}

  if (configRaw) {
    try {
      const parsed = parse(configRaw) || {}
      mergedConfig = { ...mergedConfig, ...parsed }
      sources.push(configPath)
    } catch (e) {
      console.error(`Error parsing global config at ${configPath}:`, e)
      process.exit(1)
    }
  }

  // Apply environment variable overrides (highest priority)
  const envOverrides = getEnvOverrides()
  mergedConfig = { ...mergedConfig, ...envOverrides }

  return {
    ...GlobalConfigSchema.parse({
      ...DEFAULT_GLOBAL_CONFIG,
      ...mergedConfig,
    }),
    $sources: sources,
  }
}

/**
 * Resolve the config file path (explicit or default).
 */
const resolveConfigPath = (): string => {
  const explicitConfigPath = process.env.DENVIG_GLOBAL_CONFIG_PATH
  return explicitConfigPath ? resolve(explicitConfigPath) : GLOBAL_CONFIG_PATH
}

/**
 * Load global config with the following precedence (highest to lowest):
 * 1. Environment variables (DENVIG_PROJECT_PATHS, DENVIG_QUICK_ACTIONS)
 * 2. ~/.denvig/config.yml
 * 3. Default values
 */
export const getGlobalConfig = async (): Promise<
  ConfigWithSourcePaths<GlobalConfigSchema>
> => {
  const configPath = resolveConfigPath()
  const configRaw = await safeReadTextFile(configPath)
  return buildGlobalConfig(configRaw, configPath)
}

/**
 * Synchronous variant of `getGlobalConfig()` for hot paths that must stay sync
 * (eg. deriving project refs).
 */
export const getGlobalConfigSync =
  (): ConfigWithSourcePaths<GlobalConfigSchema> => {
    const configPath = resolveConfigPath()
    let configRaw: string | null = null
    try {
      configRaw = readFileSync(configPath, 'utf8').trim() || null
    } catch {
      configRaw = null
    }
    return buildGlobalConfig(configRaw, configPath)
  }

/**
 * File name of the committed project config.
 */
export const PROJECT_CONFIG_FILENAME = '.denvig.yml'

/**
 * File name of the uncommitted, per-user project config that is merged on top
 * of the committed project config.
 */
export const PROJECT_LOCAL_CONFIG_FILENAME = '.denvig.local.yml'

/**
 * Read and parse a YAML config file into a plain object.
 * Returns null when the file is missing, empty, unreadable, not valid YAML or
 * not a YAML mapping.
 */
const readConfigLayer = async (
  path: string,
): Promise<Record<string, unknown> | null> => {
  try {
    const raw = await safeReadTextFile(path)
    if (!raw) return null
    const parsed: unknown = parse(raw)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
}

/**
 * Load the project configuration for the given project path.
 *
 * This is loaded from [projectPath]/.denvig.yml, with [projectPath]/.denvig.local.yml
 * deep merged on top when present. A local config that is corrupted or produces
 * an invalid result is ignored so the committed config keeps working.
 */
export const getProjectConfig = async (
  projectPath: string,
): Promise<ConfigWithSourcePaths<ProjectConfigSchema>> => {
  // Errors are silently ignored here — this runs in the hot discovery path
  // (including shell completion), which must not emit output. Users can run
  // `denvig config verify` to diagnose config issues.
  const configPath = `${projectPath}/${PROJECT_CONFIG_FILENAME}`
  const localConfigPath = `${projectPath}/${PROJECT_LOCAL_CONFIG_FILENAME}`
  const [baseLayer, localLayer] = await Promise.all([
    readConfigLayer(configPath),
    readConfigLayer(localConfigPath),
  ])

  const baseResult = baseLayer ? ProjectConfigSchema.safeParse(baseLayer) : null
  const base = baseResult?.success ? baseResult.data : null

  if (localLayer) {
    const mergedResult = ProjectConfigSchema.safeParse(
      mergeConfig(base ?? {}, localLayer),
    )
    if (mergedResult.success) {
      return {
        ...mergedResult.data,
        $sources: base ? [configPath, localConfigPath] : [localConfigPath],
      }
    }
  }

  if (base) {
    return { ...base, $sources: [configPath] }
  }

  return {
    $sources: [],
  }
}
