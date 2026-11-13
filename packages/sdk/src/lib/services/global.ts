import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { getGlobalConfig } from '../config.ts'
import { ServiceManager, type ServiceManagerProject } from './manager.ts'

import type { GlobalConfigSchema } from '../../schemas/config.ts'

type ServiceConfigSchema = NonNullable<GlobalConfigSchema['services']>[string]

const GLOBAL_SLUG = 'global'
const GLOBAL_ID = createHash('sha1').update('denvig-global').digest('hex')

/**
 * Global services that denvig ships with. They behave like any service defined
 * in the global config, and a service of the same name in the global config
 * overrides individual fields (eg. to point `command` at a dev build).
 */
export const BUILTIN_GLOBAL_SERVICES: Record<string, ServiceConfigSchema> = {
  denvigd: {
    command: 'denvigd',
    keepAlive: true,
    startOnBoot: true,
  },
}

/**
 * Merge the built-in global services with those from the global config.
 */
export function mergeGlobalServices(
  configured: Record<string, ServiceConfigSchema> | undefined,
): Record<string, ServiceConfigSchema> {
  const merged: Record<string, ServiceConfigSchema> = { ...configured }
  for (const [name, builtin] of Object.entries(BUILTIN_GLOBAL_SERVICES)) {
    merged[name] = { ...builtin, ...configured?.[name] }
  }
  return merged
}

/**
 * Create a ServiceManagerProject representing global services.
 * Uses a deterministic ID and reads services from the global config.
 * Services without an explicit `cwd` default to `~/.denvig/services/{serviceId}/cwd`
 * so they each get an isolated working directory instead of using $HOME.
 */
export async function createGlobalProject(): Promise<ServiceManagerProject> {
  const globalConfig = await getGlobalConfig()
  const denvigDir = resolve(homedir(), '.denvig')

  // Inject default cwd for services that don't specify one
  const services: Record<string, ServiceConfigSchema> = {}
  for (const [name, config] of Object.entries(
    mergeGlobalServices(globalConfig.services),
  )) {
    services[name] = config.cwd
      ? config
      : {
          ...config,
          cwd: resolve(denvigDir, 'services', `${GLOBAL_ID}.${name}`, 'cwd'),
        }
  }

  return {
    id: GLOBAL_ID,
    slug: GLOBAL_SLUG,
    name: 'Global',
    path: homedir(),
    config: {
      services,
    },
  }
}

/**
 * Create a ServiceManager for global services.
 */
export async function createGlobalServiceManager(): Promise<ServiceManager> {
  return new ServiceManager(await createGlobalProject())
}

/**
 * Check if a slug matches the global services slug.
 */
export function isGlobalSlug(slug: string): boolean {
  return slug === GLOBAL_SLUG
}
