import { z } from 'npm:zod'

/**
 * Root aliases are convenient helpers to avoid typing `run` all the time.
 */
const DEFAULT_ROOT_RUN_ALIASES = [
  'build',
  'check-types',
  'dev',
  'install',
  'lint',
  'outdated',
  'test',
]

/**
 * Shared config schema that is valid in a global or per project context.
 */
const SharedConfigSchema = z.object({})

/**
 * Global configuration for the system.
 *
 * This is located in ~/.denvig/config.yml but can be overridden by ENV.DENVIG_GLOBAL_CONFIG_PATH
 */
export const GlobalConfigSchema = SharedConfigSchema.extend({
  codeRootDir: z
    .string()
    .describe('The root directory where all code is stored'),
  rootActionAliases: z
    .array(z.string())
    .default(DEFAULT_ROOT_RUN_ALIASES)
    .optional()
    .describe('Aliases for common run actions that trigger on the cli roo'),
})

export type GlobalConfigSchema = z.infer<typeof GlobalConfigSchema>

/**
 * The per project configuration.
 * This is usually loaded from ~/.denvig.yml or ~/.denvig/config.yml
 *
 * @example
 * name: My Project
 * actions:
 *   build:
 *     command: pnpm build
 *   clean:
 *     command: rf -rf dist
 */
export const ProjectConfigSchema = SharedConfigSchema.extend({
  name: z.string().describe('Unique identifier for the project'),
  actions: z
    .record(
      z.string().describe('Name of the action'),
      z.object({
        command: z.string().describe('Shell command to run for the action'),
      }),
    )
    .optional()
    .describe('Actions that can be run against the project'),
  rootActionAliases: z
    .array(z.string())
    .optional()
    .describe('Aliases for common run actions that trigger on the cli roo'),
})

export type ProjectConfigSchema = z.infer<typeof ProjectConfigSchema>
