import { z } from 'zod'

/**
 * Configuration for a single service.
 */
export const ServiceConfigSchema = z.object({
  cwd: z
    .string()
    .optional()
    .describe('Working directory for the service (relative to project root)'),
  command: z.string().describe('Shell command to execute'),
  port: z.number().optional().describe('Port number the service listens on'),
  domain: z.string().optional().describe('Local domain for the service'),
  env: z
    .record(z.string(), z.string())
    .optional()
    .describe('Environment variables'),
  keepAlive: z.boolean().optional().describe('Restart service if it exits'),
  runAtLoad: z.boolean().optional().describe('Start service at system load'),
})

export type ServiceConfig = z.infer<typeof ServiceConfigSchema>

/**
 * Configuration for all services in a project.
 */
export const ServicesConfigSchema = z.record(
  z.string().describe('Service name'),
  ServiceConfigSchema,
)

export type ServicesConfig = z.infer<typeof ServicesConfigSchema>
