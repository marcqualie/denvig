import { readdir, rm, unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import launchctl from './services/launchctl.ts'
import { ServiceManager } from './services/manager.ts'

import type { DenvigProject } from './project.ts'
import type { ServiceResult } from './services/manager.ts'

export type TeardownResult = {
  success: boolean
  services: ServiceResult[]
  logsRemoved: boolean
}

export type ProjectTeardownResult = TeardownResult & {
  project: string
}

type TeardownOptions = {
  removeLogs?: boolean
}

/**
 * Teardown all denvig services globally (across all projects).
 */
export async function teardownGlobal(
  options?: TeardownOptions,
): Promise<TeardownResult> {
  const results: ServiceResult[] = []
  const successfullyRemovedLabels: string[] = []

  // Get all denvig services from launchctl
  const allServices = await launchctl.list('denvig.')

  // Bootout all services
  for (const service of allServices) {
    const bootoutResult = await launchctl.bootout(service.label)

    if (!bootoutResult.success) {
      results.push({
        name: service.label,
        success: false,
        message: `Failed to bootout: ${bootoutResult.output}`,
      })
    } else {
      successfullyRemovedLabels.push(service.label)
      results.push({
        name: service.label,
        success: true,
        message: 'Service removed from launchctl',
      })
    }
  }

  // Remove all denvig plist files from LaunchAgents directory
  const launchAgentsDir = resolve(homedir(), 'Library', 'LaunchAgents')
  try {
    const files = await readdir(launchAgentsDir)
    const denvigPlists = files.filter(
      (f) => f.startsWith('denvig.') && f.endsWith('.plist'),
    )
    await Promise.all(
      denvigPlists.map(async (file) => {
        try {
          await unlink(resolve(launchAgentsDir, file))
        } catch {
          // Ignore errors removing individual plist files
        }
      }),
    )
  } catch {
    // Ignore errors reading directory (may not exist)
  }

  // Optionally remove all denvig log files
  if (options?.removeLogs) {
    const denvigDir = resolve(homedir(), '.denvig')

    // Remove old-format log files from ~/.denvig/logs/
    const logsDir = resolve(denvigDir, 'logs')
    try {
      const logFiles = await readdir(logsDir)
      await Promise.all(
        logFiles.map(async (file) => {
          try {
            await unlink(resolve(logsDir, file))
          } catch {
            // Ignore errors removing individual log files
          }
        }),
      )
    } catch {
      // Ignore errors reading directory (may not exist)
    }

    // Remove new-format service log directories from ~/.denvig/services/
    const servicesDir = resolve(denvigDir, 'services')
    try {
      const serviceDirs = await readdir(servicesDir)
      await Promise.all(
        serviceDirs
          .filter((d) => d.startsWith('denvig.') || d.includes('.'))
          .map(async (dir) => {
            try {
              await rm(resolve(servicesDir, dir, 'logs'), {
                recursive: true,
                force: true,
              })
            } catch {
              // Ignore errors removing individual service log dirs
            }
          }),
      )
    } catch {
      // Ignore errors reading directory (may not exist)
    }
  }

  return {
    success: true,
    services: results,
    logsRemoved: options?.removeLogs ?? false,
  }
}

/**
 * Teardown all services for a specific project.
 */
export async function teardownProject(
  project: DenvigProject,
  options?: TeardownOptions,
): Promise<ProjectTeardownResult> {
  const manager = new ServiceManager(project)
  const services = await manager.teardownAll({
    removeLogs: options?.removeLogs,
  })

  return {
    success: true,
    project: project.slug,
    services,
    logsRemoved: options?.removeLogs ?? false,
  }
}
