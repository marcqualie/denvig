import { dirname, resolve } from 'node:path'
import { parse } from 'yaml'

import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'
import { safeReadTextFileSync } from './safeReadFile.ts'

export const GLOBAL_CONFIG_PATH = resolve(
  process.env.DENVIG_GLOBAL_CONFIG_PATH ||
    `${process.env.HOME}/.denvig/config.yml`,
)

const DEFAULT_GLOBAL_CONFIG = {
  projectPaths: ['~/src/*/*', '~/.dotfiles'],
  quickActions: undefined,
} satisfies GlobalConfigSchema

export type ConfigWithSourcePaths<C> = C & {
  $sources: string[]
}

/**
 * Load global config from the the root file path.
 *
 * Default is ~/.denvig/config.yml but it can be overridden
 * by the DENVIG_GLOBAL_CONFIG_PATH environment variable.
 */
/**
 * Expand ~ to home directory in a path.
 */
export const expandTilde = (path: string): string => {
  if (path.startsWith('~/')) {
    return `${process.env.HOME}${path.slice(1)}`
  }
  return path
}

export const getGlobalConfig =
  (): ConfigWithSourcePaths<GlobalConfigSchema> => {
    const configRaw = safeReadTextFileSync(GLOBAL_CONFIG_PATH)
    if (configRaw) {
      const globalConfig = (parse(configRaw) ||
        {}) as Partial<GlobalConfigSchema>
      try {
        return {
          ...GlobalConfigSchema.parse({
            ...DEFAULT_GLOBAL_CONFIG,
            ...globalConfig,
          }),
          $sources: [GLOBAL_CONFIG_PATH],
        }
      } catch (e) {
        console.error(
          `Error parsing global config at ${GLOBAL_CONFIG_PATH}:`,
          e,
        )
        process.exit(1)
      }
    }

    return {
      ...GlobalConfigSchema.parse(DEFAULT_GLOBAL_CONFIG),
      $sources: [],
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
