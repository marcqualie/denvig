import { createHash } from 'node:crypto'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { getGlobalConfig } from '../config.ts'
import { ServiceManager, type ServiceManagerProject } from './manager.ts'

const GLOBAL_SLUG = 'global'
const GLOBAL_ID = createHash('sha1').update('denvig-global').digest('hex')

/**
 * Create a ServiceManagerProject representing global services.
 * Uses a deterministic ID and reads services from the global config.
 * Services without an explicit `cwd` default to `~/.denvig/services/{serviceId}/cwd`
 * so they each get an isolated working directory instead of using $HOME.
 */
export function createGlobalProject(): ServiceManagerProject {
  const globalConfig = getGlobalConfig()
  const denvigDir = resolve(homedir(), '.denvig')

  // Inject default cwd for services that don't specify one
  let services = globalConfig.services
  if (services) {
    const patched: typeof services = {}
    for (const [name, config] of Object.entries(services)) {
      if (config.cwd) {
        patched[name] = config
      } else {
        patched[name] = {
          ...config,
          cwd: resolve(denvigDir, 'services', `${GLOBAL_ID}.${name}`, 'cwd'),
        }
      }
    }
    services = patched
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
export function createGlobalServiceManager(): ServiceManager {
  return new ServiceManager(createGlobalProject())
}

/**
 * Check if a slug matches the global services slug.
 */
export function isGlobalSlug(slug: string): boolean {
  return slug === GLOBAL_SLUG
}
