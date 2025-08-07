import { parse } from 'jsr:@std/yaml'
import { dirname, resolve } from 'node:path'

import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'
import { safeReadTextFileSync } from './safeReadFile.ts'

export const GLOBAL_CONFIG_PATH = resolve(
  Deno.env.get('DENVIG_GLOBAL_CONFIG_PATH') ||
    `${Deno.env.get('HOME')}/.denvig/config.yml`,
)

const DEFAULT_GLOBAL_CONFIG = {
  codeRootDir: `${Deno.env.get('HOME')}/src`,
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
export const getGlobalConfig =
  (): ConfigWithSourcePaths<GlobalConfigSchema> => {
    const configRaw = safeReadTextFileSync(GLOBAL_CONFIG_PATH)
    if (configRaw) {
      const globalConfig = GlobalConfigSchema.parse(parse(configRaw))
      try {
        if (globalConfig.codeRootDir?.startsWith('.')) {
          const configDir = dirname(GLOBAL_CONFIG_PATH)
          globalConfig.codeRootDir = resolve(
            `${configDir}/${globalConfig.codeRootDir}`,
          )
        }
        return {
          ...DEFAULT_GLOBAL_CONFIG,
          ...globalConfig,
          $sources: [GLOBAL_CONFIG_PATH],
        }
      } catch (e) {
        console.error(
          `Error parsing global config at ${GLOBAL_CONFIG_PATH}:`,
          e,
        )
        Deno.exit(1)
      }
    }

    return {
      ...GlobalConfigSchema.parse(DEFAULT_GLOBAL_CONFIG),
      $sources: [],
    }
  }

/**
 * Load the project configuration for the given project slug.
 * This is usually loaded from ~/.denvig.yml or ~/.denvig/config.yml
 */
export const getProjectConfig = (
  projectSlug: string,
): ConfigWithSourcePaths<ProjectConfigSchema> => {
  const globalConfig = getGlobalConfig()
  const defaultConfig = {
    name: projectSlug,
    actions: {},
  }
  const configPath = `${globalConfig.codeRootDir}/${projectSlug}/.denvig.yml`
  const configRaw = safeReadTextFileSync(configPath)
  if (configRaw) {
    try {
      return {
        ...defaultConfig,
        ...ProjectConfigSchema.parse(parse(configRaw)),
        $sources: [configPath],
      }
    } catch (e: unknown) {
      console.warn(
        `Error parsing project config for ${projectSlug} at ${configPath}.`,
      )
      if (e instanceof Error) {
        console.warn(e.message)
      } else {
        console.warn('Unknown error:', e)
      }
    }
  }
  return {
    ...defaultConfig,
    $sources: [],
  }
}
