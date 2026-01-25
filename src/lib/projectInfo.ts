import launchctl, { type LaunchctlListItem } from './services/launchctl.ts'
import { ServiceManager } from './services/manager.ts'

import type { ProjectConfigSchema } from '../schemas/config.ts'
import type { DenvigProject } from './project.ts'

export type ServiceStatus = 'running' | 'stopped' | 'none'

export type ProjectInfo = {
  id: string
  slug: string
  name: string
  path: string
  config: ProjectConfigSchema | null
  serviceStatus: ServiceStatus
}

export type GetProjectInfoOptions = {
  /** Pre-fetched launchctl list to avoid repeated shell calls */
  launchctlList?: LaunchctlListItem[]
  /** Include service status in the response (requires launchctl calls) */
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
  const hasConfig = project.config.$sources.length > 0
  const includeServiceStatus = options?.includeServiceStatus ?? true

  // Extract config without internal $sources property
  const { $sources: _, ...configWithoutSources } = project.config

  // Determine service status (only when requested)
  let serviceStatus: ServiceStatus = 'none'
  if (includeServiceStatus) {
    const services = project.config.services || {}
    const serviceNames = Object.keys(services)

    if (serviceNames.length > 0) {
      // Use provided launchctl list or fetch it
      const launchctlList =
        options?.launchctlList ?? (await launchctl.list('denvig.'))

      const manager = new ServiceManager(project)
      let hasRunningService = false

      for (const serviceName of serviceNames) {
        const response = await manager.getServiceResponse(serviceName, {
          launchctlList,
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
    id: project.id,
    slug: project.slug,
    name: project.name,
    path: project.path,
    config: hasConfig ? configWithoutSources : null,
    serviceStatus,
  }
}
