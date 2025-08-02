import { parse } from 'jsr:@std/yaml'

import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'
import { safeReadTextFileSync } from './safeReadFile.ts'

export const GLOBAL_CONFIG_PATH =
  Deno.env.get('DENIG_GLOBAL_CONFIG_PATH') ||
  `${Deno.env.get('HOME')}/.denvig/config.yml`

const DEFAULT_GLOBAL_CONFIG = {
  codeRootDir: `${Deno.env.get('HOME')}/src`,
} satisfies GlobalConfigSchema

/**
 * Load global config from the the root file path.
 *
 * Default is ~/.denvig/config.yml but it can be overridden
 * by the DENIG_GLOBAL_CONFIG_PATH environment variable.
 */
export const getGlobalConfig = (): GlobalConfigSchema => {
  const configRaw = safeReadTextFileSync(GLOBAL_CONFIG_PATH)
  if (configRaw) {
    try {
      return {
        ...DEFAULT_GLOBAL_CONFIG,
        ...GlobalConfigSchema.parse(parse(configRaw)),
      }
    } catch (e) {
      console.error(`Error parsing global config at ${GLOBAL_CONFIG_PATH}:`, e)
      Deno.exit(1)
    }
  }

  return GlobalConfigSchema.parse(DEFAULT_GLOBAL_CONFIG)
}

/**
 * Load the project configuration for the given project slug.
 * This is usually loaded from ~/.denvig.yml or ~/.denvig/config.yml
 */
export const getProjectConfig = (projectSlug: string): ProjectConfigSchema => {
  const globalConfig = getGlobalConfig()
  try {
    const configPath = `${globalConfig.codeRootDir}/${projectSlug}/.denvig.yml`

    if (Deno.statSync(configPath).isFile) {
      const configFile = Deno.readTextFileSync(configPath)
      return ProjectConfigSchema.parse(JSON.parse(configFile))
    }
  } catch (_e: unknown) {
    // Write to a log file?
  }

  return {
    name: projectSlug,
    actions: {},
  }
}
