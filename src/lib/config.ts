import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'

/**
 * TODO: Load this from ~/.denvig.yml
 */
export const getGlobalConfig = (): GlobalConfigSchema => {
  return GlobalConfigSchema.parse({
    codeRootDir: `${Deno.env.get('HOME')}/src`,
  })
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
