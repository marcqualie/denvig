import { z } from 'zod'

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
 * Global configuration for the system.
 *
 * This is located in ~/.denvig/config.yml but can be overridden by ENV.DENVIG_GLOBAL_CONFIG_PATH
 */
export const GlobalConfigSchema = z.object({
  codeRootDir: z
    .string()
    .optional()
    .default('~/src')
    .describe('The base directory where projects are stored'),
  quickActions: z
    .array(z.string())
    .default(DEFAULT_QUICK_ACTIONS)
    .optional()
    .describe('Quick actions that are available for all projects'),
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
export const ProjectConfigSchema = z.object({
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
  services: z
    .record(
      z.string(),
      z.object({
        cwd: z
          .string()
          .optional()
          .describe(
            'Working directory for the service (relative to project root)',
          ),
        command: z.string().describe('Shell command to execute'),
        port: z
          .number()
          .optional()
          .describe('Port number the service listens on'),
        domain: z.string().optional().describe('Local domain for the service'),
        envFile: z
          .string()
          .optional()
          .describe('Path to .env file (relative to project root)'),
        env: z
          .record(z.string(), z.string())
          .optional()
          .describe('Environment variables'),
        keepAlive: z
          .boolean()
          .optional()
          .describe('Restart service if it exits'),
      }),
    )
    .optional()
    .describe('Service that can be managed for this project'),
})

export type ProjectConfigSchema = z.infer<typeof ProjectConfigSchema>
