import {
  getService,
  startService,
  stopService,
} from '../operations/services.ts'
import { track } from './context.ts'

import type { DenvigProject as InternalProject } from '../lib/project.ts'
import type { ServiceResponse } from '../types/responses.ts'
import type { ResourceContext } from './context.ts'

export type ServiceStartOptions = {
  /**
   * Explicit domains to route to this start, replacing the domains declared
   * in the service config. Each domain is claimed unconditionally — any
   * existing route is taken over and handed back to a running owner when
   * this service stops. When omitted, the configured domains are used. Pass
   * an empty array to start the service without claiming any domain (it runs
   * on its port only and does not take over an existing route).
   */
  domains?: string[]
  /**
   * The port to start the service on: a specific number, or `'random'` to
   * always allocate a free port. When omitted, the configured port is used,
   * falling back to a random port when it's already in use.
   */
  port?: number | 'random'
}

/**
 * A single service belonging to a project. Lifecycle calls resolve the service
 * (including cross-project identifiers and the optional worktree override) and
 * are logged via the owning SDK client.
 */
export class DenvigService {
  private readonly project: InternalProject
  private readonly serviceName: string
  private readonly worktreeName: string | undefined
  private readonly ctx: ResourceContext

  constructor(
    project: InternalProject,
    serviceName: string,
    worktreeName: string | undefined,
    ctx: ResourceContext,
  ) {
    this.project = project
    this.serviceName = serviceName
    this.worktreeName = worktreeName
    this.ctx = ctx
  }

  get name(): string {
    return this.serviceName
  }

  /** Start the service and return its resulting status. */
  async start(options: ServiceStartOptions = {}): Promise<ServiceResponse> {
    return track(this.ctx, 'services.start', this.project.slug, () =>
      startService(this.project, this.serviceName, {
        worktree: this.worktreeName,
        domains: options.domains,
        port: options.port,
      }),
    )
  }

  /** Stop the service and return its resulting status. */
  async stop(): Promise<ServiceResponse> {
    return track(this.ctx, 'services.stop', this.project.slug, () =>
      stopService(this.project, this.serviceName, {
        worktree: this.worktreeName,
      }),
    )
  }

  /** Get the service's current status, including recent log lines. */
  async status(): Promise<ServiceResponse> {
    return track(this.ctx, 'services.status', this.project.slug, () =>
      getService(this.project, this.serviceName, {
        worktree: this.worktreeName,
        includeLogs: true,
      }),
    )
  }
}
