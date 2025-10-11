import { z } from 'zod'

import { ServicesConfigSchema } from './services.ts'

/**
 * Actions that are available on the CLI root for quick access.
 */
const DEFAULT_QUICK_ACTIONS = [
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
  quickActions: z
    .array(z.string())
    .default(DEFAULT_QUICK_ACTIONS)
    .optional()
    .describe('Actions that are available on the CLI root for quick access'),
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
  quickActions: z
    .array(z.string())
    .optional()
    .describe('Actions that are available on the CLI root for quick access'),
  services: ServicesConfigSchema.optional().describe(
    'Service definitions for the project',
  ),
})

export type ProjectConfigSchema = z.infer<typeof ProjectConfigSchema>
