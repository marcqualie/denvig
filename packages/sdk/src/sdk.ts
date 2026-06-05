import { getGlobalConfig } from './lib/config.ts'
import { resolveProjectContext } from './lib/context.ts'
import { DenvigValidationError } from './lib/errors.ts'
import { listCertificates } from './operations/certs.ts'
import { track } from './resources/context.ts'
import { wrapProject } from './resources/internal.ts'

import type {
  DenvigCertificate,
  ListCertificatesOptions,
} from './operations/certs.ts'
import type { DenvigConfig } from './resources/config.ts'
import type { ResourceContext } from './resources/context.ts'
import type { DenvigProject } from './resources/project.ts'

/**
 * Regex pattern for valid client names. Must start with a letter, contain only
 * lowercase alphanumeric and hyphens, and not end with a hyphen.
 */
const CLIENT_NAME_PATTERN = /^[a-z]([a-z0-9-]*[a-z0-9])?$/

export type DenvigSDKOptions = {
  /**
   * Client identifier for the integration using the SDK (required). Used for
   * usage logging to track which integration is calling the SDK. Logs include
   * `via: 'sdk:${client}'` (e.g. `sdk:raycast`).
   */
  client: string

  /**
   * Working directory used to detect the project when no explicit project is
   * given.
   * @default process.cwd()
   */
  cwd?: string
}

/**
 * Denvig SDK for in-process, programmatic access to denvig's logic.
 *
 * The SDK is resource-oriented: resolve a project, then chain into its
 * worktrees, actions, services, dependencies and config. Global concerns
 * (certificates, the global config) hang off the SDK directly.
 *
 * @example
 * ```ts
 * import { DenvigSDK } from '@denvig/sdk'
 *
 * const denvig = new DenvigSDK({ client: 'my-app' })
 * const project = await denvig.projects.retrieve('local:/path/to/project')
 * const service = await project.services.retrieve('api')
 * await service.start()
 * ```
 */
export class DenvigSDK {
  private ctx: ResourceContext

  constructor(options: DenvigSDKOptions) {
    if (!CLIENT_NAME_PATTERN.test(options.client)) {
      throw new Error(
        `Invalid client name "${options.client}". Must start with a letter, contain only lowercase alphanumeric and hyphens, and not end with a hyphen.`,
      )
    }
    this.ctx = { client: options.client, cwd: options.cwd ?? process.cwd() }
  }

  projects = {
    /**
     * Resolve a project by identifier (`id:…`, `local:…`, `github:…`) or path.
     */
    retrieve: async (identifier: string): Promise<DenvigProject> => {
      const context = await resolveProjectContext({
        cwd: this.ctx.cwd,
        project: identifier,
      })
      if (!context.project) {
        throw new DenvigValidationError(
          `Project "${identifier}" could not be resolved.`,
        )
      }
      return wrapProject(context.project, this.ctx)
    },
  }

  certificates = {
    /** List managed TLS certificates, optionally filtered by domain. */
    list: (options?: ListCertificatesOptions): Promise<DenvigCertificate[]> =>
      track(this.ctx, 'certificates.list', null, () =>
        listCertificates(options),
      ),
  }

  config = {
    /**
     * Retrieve configuration. Without `project`, returns the global config;
     * with `project`, returns that project's configuration.
     */
    retrieve: async (options?: { project?: string }): Promise<DenvigConfig> => {
      if (!options?.project) {
        return getGlobalConfig()
      }
      const context = await resolveProjectContext({
        cwd: this.ctx.cwd,
        project: options.project,
      })
      if (!context.project) {
        throw new DenvigValidationError(
          `Project "${options.project}" could not be resolved.`,
        )
      }
      return context.project.activeWorktree.config
    },
  }
}
