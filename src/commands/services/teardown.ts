import { unlink } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { Command } from '../../lib/command.ts'
import launchctl from '../../lib/services/launchctl.ts'
import { ServiceManager } from '../../lib/services/manager.ts'

import type { ServiceResult } from '../../lib/services/manager.ts'

type GlobalTeardownResult = {
  success: boolean
  services: ServiceResult[]
  logsRemoved: boolean
}

/**
 * Teardown all denvig services globally (across all projects).
 */
async function teardownGlobal(options?: {
  removeLogs?: boolean
}): Promise<GlobalTeardownResult> {
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

  // Only remove plist files for services that were successfully booted out
  const launchAgentsDir = resolve(homedir(), 'Library', 'LaunchAgents')
  await Promise.all(
    successfullyRemovedLabels.map(async (label) => {
      try {
        await unlink(resolve(launchAgentsDir, `${label}.plist`))
      } catch {
        // Ignore errors removing individual plist files
      }
    }),
  )

  // Optionally remove all denvig log files
  if (options?.removeLogs && successfullyRemovedLabels.length > 0) {
    const logsDir = resolve(homedir(), '.denvig', 'logs')

    // Extract log prefixes from labels (format: denvig.{slug}__{serviceName})
    const serviceLogPrefixes = successfullyRemovedLabels.map((label) =>
      label.replace('denvig.', ''),
    )

    await Promise.all(
      serviceLogPrefixes.flatMap((prefix) => [
        unlink(resolve(logsDir, `${prefix}.log`)).catch(() => {}),
        unlink(resolve(logsDir, `${prefix}.error.log`)).catch(() => {}),
      ]),
    )
  }

  return {
    success: true,
    services: results,
    logsRemoved: options?.removeLogs ?? false,
  }
}

export const servicesTeardownCommand = new Command({
  name: 'services:teardown',
  description: 'Stop all services and remove them from launchctl',
  usage: 'services teardown [--global] [--remove-logs]',
  example: 'services teardown',
  args: [],
  flags: [
    {
      name: 'global',
      description: 'Teardown all denvig services across all projects',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'remove-logs',
      description: 'Also remove log files',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ project, flags }) => {
    const removeLogs = flags['remove-logs'] as boolean
    const global = flags.global as boolean

    if (global) {
      // Global teardown - all denvig services across all projects
      if (!flags.json) {
        console.log('Tearing down all denvig services globally...')
      }

      const result = await teardownGlobal({ removeLogs })

      if (flags.json) {
        console.log(JSON.stringify(result))
      } else {
        if (result.services.length === 0) {
          console.log('No services found to teardown.')
        } else {
          for (const service of result.services) {
            if (service.success) {
              console.log(`✓ ${service.name} removed`)
            } else {
              console.log(`✗ ${service.name}: ${service.message}`)
            }
          }
          console.log('')
          console.log(
            `Teardown complete. ${result.services.filter((r) => r.success).length}/${result.services.length} services removed.`,
          )
          if (removeLogs) {
            console.log('Log files have been removed.')
          }
        }
      }

      return { success: true, message: 'Global teardown complete' }
    }

    // Project-specific teardown
    const manager = new ServiceManager(project)

    if (!flags.json) {
      console.log(`Tearing down all services for ${project.slug}...`)
    }

    const results = await manager.teardownAll({ removeLogs })

    if (flags.json) {
      console.log(
        JSON.stringify({
          success: true,
          project: project.slug,
          services: results,
          logsRemoved: removeLogs,
        }),
      )
    } else {
      if (results.length === 0) {
        console.log('No services found to teardown.')
      } else {
        for (const result of results) {
          if (result.success) {
            console.log(`✓ ${result.name} removed`)
          } else {
            console.log(`✗ ${result.name}: ${result.message}`)
          }
        }
        console.log('')
        console.log(
          `Teardown complete. ${results.filter((r) => r.success).length}/${results.length} services removed.`,
        )
        if (removeLogs) {
          console.log('Log files have been removed.')
        }
      }
    }

    return { success: true, message: 'Teardown complete' }
  },
})
