import serviceBackend, { type ServiceListItem } from './services/backend.ts'
import { ServiceManager } from './services/manager.ts'

import type { ProjectConfigSchema } from '../schemas/config.ts'
import type { ProjectWorktree } from './project/git.ts'
import type { GitProviderMatch } from './project/git-providers.ts'
import type { DenvigProject } from './project.ts'

export type ServiceStatus = 'running' | 'stopped' | 'none'

export type ProjectInfo = {
  id: string
  slug: string
  name: string
  path: string
  refs: string[]
  gitProvider: GitProviderMatch | null
  worktrees: ProjectWorktree[]
  config: ProjectConfigSchema | null
  serviceStatus: ServiceStatus
}

export type GetProjectInfoOptions = {
  /**
   * Pre-fetched service manager list to avoid repeated shell calls
   */
  serviceList?: ServiceListItem[]
  /**
   * Pre-fetched launchctl list to avoid repeated shell calls
   *
   * @deprecated Use `serviceList`, which also covers systemd on Linux.
   */
  launchctlList?: ServiceListItem[]
  /**
   * Include service status in the response (requires service manager calls)
   */
  includeServiceStatus?: boolean
}

/**
 * Build project info for a DenvigProject instance.
 * This is the canonical function for getting project info used by both
 * `denvig info` and `denvig projects` commands.
 */
export const getProjectInfo = async (
  project: DenvigProject,
  options?: GetProjectInfoOptions,
): Promise<ProjectInfo> => {
  const active = project.activeWorktree
  const hasConfig = active.config.$sources.length > 0
  const includeServiceStatus = options?.includeServiceStatus ?? true

  // Extract config without internal $sources property
  const { $sources: _, ...configWithoutSources } = active.config

  // Determine service status (only when requested)
  let serviceStatus: ServiceStatus = 'none'
  if (includeServiceStatus) {
    const services = active.config.services || {}
    const serviceNames = Object.keys(services)

    if (serviceNames.length > 0) {
      // Use provided service list or fetch it
      const serviceList =
        options?.serviceList ??
        options?.launchctlList ??
        (await serviceBackend.list('denvig.'))

      const manager = new ServiceManager(active)
      let hasRunningService = false

      for (const serviceName of serviceNames) {
        const response = await manager.getServiceResponse(serviceName, {
          serviceList,
        })
        if (response?.status === 'running') {
          hasRunningService = true
          break
        }
      }

      serviceStatus = hasRunningService ? 'running' : 'stopped'
    }
  }

  return {
    id: active.id,
    slug: active.slug,
    name: active.name,
    path: active.path,
    refs: active.refs,
    gitProvider: active.gitProvider,
    worktrees: project.worktrees
      .filter((wt) => !wt.isPrimary)
      .map((wt) => ({ path: wt.path, branch: wt.branch })),
    config: hasConfig ? configWithoutSources : null,
    serviceStatus,
  }
}
