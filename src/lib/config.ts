import { resolve } from 'node:path'
import { parse } from 'yaml'

import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'
import { safeReadTextFileSync } from './safeReadFile.ts'

/** Global config file location */
const GLOBAL_CONFIG_PATH = resolve(`${process.env.HOME}/.denvig/config.yml`)

const DEFAULT_GLOBAL_CONFIG = {
  projectPaths: ['~/src/*/*', '~/.dotfiles'],
  quickActions: undefined,
} satisfies GlobalConfigSchema

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
 * Load global config with the following precedence (highest to lowest):
 * 1. Environment variables (DENVIG_PROJECT_PATHS, DENVIG_QUICK_ACTIONS)
 * 2. ~/.denvig/config.yml
 * 3. Default values
 */
export const getGlobalConfig =
  (): ConfigWithSourcePaths<GlobalConfigSchema> => {
    const sources: string[] = []
    let mergedConfig: Partial<GlobalConfigSchema> = {}

    // Check if explicit config path is provided (for testing)
    const explicitConfigPath = process.env.DENVIG_GLOBAL_CONFIG_PATH
    const configPath = explicitConfigPath
      ? resolve(explicitConfigPath)
      : GLOBAL_CONFIG_PATH

    // Load from config path (~/.denvig/config.yml or explicit path)
    const configRaw = safeReadTextFileSync(configPath)
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
 * Load the project configuration for the given project path.
 * This is usually loaded from [projectPath]/.denvig.yml
 */
export const getProjectConfig = (
  projectPath: string,
  defaultName?: string,
): ConfigWithSourcePaths<ProjectConfigSchema> => {
  const defaultConfig = {
    name: defaultName || projectPath.split('/').pop() || 'unknown',
    actions: {},
  }
  const configPath = `${projectPath}/.denvig.yml`
  const configRaw = safeReadTextFileSync(configPath)
  if (configRaw) {
    try {
      return {
        ...defaultConfig,
        ...ProjectConfigSchema.parse(parse(configRaw)),
        $sources: [configPath],
      }
    } catch {
      // Silently ignore config parsing errors here.
      // Users can run `denvig config verify` to diagnose config issues.
    }
  }
  return {
    ...defaultConfig,
    $sources: [],
  }
}
