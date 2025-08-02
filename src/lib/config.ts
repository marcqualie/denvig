import { parse } from 'jsr:@std/yaml'

import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'
import { safeReadTextFileSync } from './safeReadFile.ts'

export const GLOBAL_CONFIG_PATH =
  Deno.env.get('DENIG_GLOBAL_CONFIG_PATH') ||
  `${Deno.env.get('HOME')}/.denvig/config.yml`

const DEFAULT_GLOBAL_CONFIG = {
  codeRootDir: `${Deno.env.get('HOME')}/src`,
} satisfies GlobalConfigSchema

export type ConfigWithSourcePaths<C> = C & {
  $sources: string[]
}

/**
 * Load global config from the the root file path.
 *
 * Default is ~/.denvig/config.yml but it can be overridden
 * by the DENIG_GLOBAL_CONFIG_PATH environment variable.
 */
export const getGlobalConfig =
  (): ConfigWithSourcePaths<GlobalConfigSchema> => {
    const configRaw = safeReadTextFileSync(GLOBAL_CONFIG_PATH)
    if (configRaw) {
      try {
        return {
          ...DEFAULT_GLOBAL_CONFIG,
          ...GlobalConfigSchema.parse(parse(configRaw)),
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
