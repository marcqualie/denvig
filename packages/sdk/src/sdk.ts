import { getGlobalConfig } from './lib/config.ts'
import { resolveProjectContext } from './lib/context.ts'
import { DenvigValidationError } from './lib/errors.ts'
import { DenvigProject as InternalProject } from './lib/project.ts'
import { listProjects } from './lib/projects.ts'
import {
  configureCa,
  createCertificate,
  getCaStatus,
  importCertificate,
  listCertificates,
  removeCa,
  removeCertificate,
  retrieveCertificate,
} from './operations/certs.ts'
import { configureGatewayAll, getGatewayStatus } from './operations/gateway.ts'
import { track } from './resources/context.ts'
import { wrapProject } from './resources/internal.ts'

import type { ListProjectsOptions } from './lib/projects.ts'
import type {
  CaStatus,
  CertificateLocation,
  CertificateRef,
  ConfigureCaResult,
  CreateCertificateOptions,
  CreateCertificateResult,
  DenvigCertificate,
  ImportCertificateOptions,
  ImportCertificateResult,
  ListCertificatesOptions,
  RemoveCertificateResult,
} from './operations/certs.ts'
import type {
  ConfigureGatewayOutput,
  GatewayStatus,
} from './operations/gateway.ts'
import type { DenvigConfig } from './resources/config.ts'
import type { ResourceContext } from './resources/context.ts'
import type { DenvigProject } from './resources/project.ts'

/** A detected project plus its slug, or nulls when none could be resolved. */
export type DetectProjectResult = {
  project: DenvigProject | null
  projectPath: string | null
  slug: string | null
}

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

    /**
     * List every project discovered under the configured project paths. Each
     * project family (its primary checkout plus sibling worktrees) appears once,
     * rooted at the primary.
     */
    list: (options?: ListProjectsOptions): Promise<DenvigProject[]> =>
      track(this.ctx, 'projects.list', null, async () => {
        const discovered = await listProjects(options)
        const families = new Map<string, DenvigProject>()
        for (const { path } of discovered) {
          const internal = await InternalProject.retrieve(path)
          const key = internal.primaryWorktree.path
          if (families.has(key)) continue
          internal.activeWorktree = internal.primaryWorktree
          families.set(key, wrapProject(internal, this.ctx))
        }
        return [...families.values()].sort((a, b) =>
          a.path.localeCompare(b.path),
        )
      }),

    /**
     * Detect the active project from the SDK's `cwd` or an explicit identifier,
     * returning `null` (rather than throwing) when none can be resolved. Used by
     * hosts that must keep running without a project (e.g. the CLI entry point).
     */
    detect: async (identifier?: string): Promise<DetectProjectResult> => {
      const context = await resolveProjectContext({
        cwd: this.ctx.cwd,
        project: identifier,
      })
      return {
        project: context.project
          ? wrapProject(context.project, this.ctx)
          : null,
        projectPath: context.projectPath,
        slug: context.slug,
      }
    },
  }

  certs = {
    /** List managed TLS certificates, optionally filtered by domain. */
    list: (options?: ListCertificatesOptions): Promise<DenvigCertificate[]> =>
      track(this.ctx, 'certs.list', null, () => listCertificates(options)),

    /** Look up a managed certificate by `domain` or directory `name`. */
    retrieve: (ref: CertificateRef): Promise<CertificateLocation | null> =>
      track(this.ctx, 'certs.retrieve', null, () => retrieveCertificate(ref)),

    /** Issue a certificate for a domain, signed by the local CA. */
    create: (
      options: CreateCertificateOptions,
    ): Promise<CreateCertificateResult> =>
      track(this.ctx, 'certs.create', null, () => createCertificate(options)),

    /** Remove a managed certificate by `domain` or directory `name`. */
    remove: (ref: CertificateRef): Promise<RemoveCertificateResult> =>
      track(this.ctx, 'certs.remove', null, () => removeCertificate(ref)),

    /** Import an existing key/certificate pair into the managed certs. */
    import: (
      options: ImportCertificateOptions,
    ): Promise<ImportCertificateResult> =>
      track(this.ctx, 'certs.import', null, () => importCertificate(options)),

    /** The local Certificate Authority that signs locally-issued certs. */
    ca: {
      /** Report whether the local CA is configured and its details. */
      status: (): Promise<CaStatus> =>
        track(this.ctx, 'certs.ca.status', null, () => getCaStatus()),

      /** Generate the local CA if missing and install it to the keychain. */
      configure: (): Promise<ConfigureCaResult> =>
        track(this.ctx, 'certs.ca.configure', null, () => configureCa()),

      /** Remove the local CA from the system keychain. */
      remove: (): Promise<{ path: string }> =>
        track(this.ctx, 'certs.ca.remove', null, () => removeCa()),
    },
  }

  gateway = {
    /**
     * Report the gateway's global state plus the gateway-configured services of
     * the project resolved from the SDK's `cwd`.
     */
    status: (): Promise<GatewayStatus> =>
      track(this.ctx, 'gateway.status', null, () =>
        getGatewayStatus({ cwd: this.ctx.cwd }),
      ),

    /** Reconcile services and rebuild every nginx config from runtime state. */
    configure: (): Promise<ConfigureGatewayOutput> =>
      track(this.ctx, 'gateway.configure', null, () => configureGatewayAll()),
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
