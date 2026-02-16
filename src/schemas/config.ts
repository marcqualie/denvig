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
 * Schema for a service name key used in service records.
 */
export const ServiceNameSchema = z
  .string()
  .max(64, 'Service name must be 64 characters or less')
  .regex(
    /^[a-z]([a-z0-9-]*[a-z0-9])?$/,
    'Service name must start with a letter, contain only lowercase alphanumeric and hyphens, and not end with a hyphen',
  )

/**
 * Schema for a single service configuration entry.
 */
export const ServiceConfigSchema = z.object({
  cwd: z
    .string()
    .optional()
    .describe('Working directory for the service (relative to project root)'),
  command: z.string().describe('Shell command to execute'),
  http: z
    .object({
      port: z
        .number()
        .optional()
        .describe('Port number the service listens on'),
      domain: z
        .string()
        .optional()
        .describe('Domain to use for the service URL'),
      cnames: z
        .array(z.string())
        .optional()
        .describe('Additional hosts that can be used via gateway'),
      secure: z.boolean().optional().describe('Use HTTPS instead of HTTP'),
    })
    .optional()
    .describe('HTTP configuration for the service URL'),
  envFiles: z
    .array(z.string())
    .optional()
    .describe('Paths to .env files (relative to service cwd)'),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe('Environment variables'),
  keepAlive: z.boolean().optional().describe('Restart service if it exits'),
  startOnBoot: z
    .boolean()
    .optional()
    .describe('Start service automatically when system boots'),
})

/**
 * Schema for the services record (name → config).
 */
export const ServicesConfigSchema = z
  .record(ServiceNameSchema, ServiceConfigSchema)
  .optional()
  .describe('Services that can be managed')

/**
 * Global configuration for the system.
 *
 * This is located in ~/.denvig/config.yml but can be overridden by ENV.DENVIG_GLOBAL_CONFIG_PATH
 */
export const GlobalConfigSchema = z.object({
  projectPaths: z
    .array(z.string())
    .optional()
    .default(['~/src/*/*', '~/.dotfiles'])
    .describe('Paths or patterns where projects are located'),
  quickActions: z
    .array(z.string())
    .default(DEFAULT_QUICK_ACTIONS)
    .optional()
    .describe('Quick actions that are available for all projects'),
  services: ServicesConfigSchema.describe(
    'Global services that can be managed from any directory',
  ),
  experimental: z
    .object({
      gateway: z
        .object({
          enabled: z.boolean(),
          handler: z.enum(['nginx']).default('nginx'),
          configsPath: z.string().default(`/opt/homebrew/etc/nginx/servers`),
        })
        .optional(),
    })
    .optional(),
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
  name: z.string().optional().describe('Display name for the project'),
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
  services: ServicesConfigSchema,
})

export type ProjectConfigSchema = z.infer<typeof ProjectConfigSchema>
