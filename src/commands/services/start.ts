import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import {
  getServiceCompletions,
  getServiceContext,
} from '../../lib/services/identifier.ts'

export const servicesStartCommand = new Command({
  name: 'services:start',
  description: 'Start a service',
  usage: 'services start <name>',
  example: 'services start api',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., api or marcqualie/denvig/hello)',
      required: true,
      type: 'string',
    },
  ],
  flags: [],
  completions: ({ project }) => {
    return getServiceCompletions(project)
  },
  handler: async ({ project, args, flags }) => {
    const serviceArg = z.string().parse(args.name)

    const {
      manager,
      serviceName,
      project: targetProject,
    } = getServiceContext(serviceArg, project)

    const projectPrefix =
      targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

    if (!flags.json) {
      console.log(`Starting ${projectPrefix}${serviceName}...`)
    }

    const result = await manager.startService(serviceName)

    if (!result.success) {
      if (flags.json) {
        console.log(
          JSON.stringify({
            success: false,
            service: serviceName,
            project: targetProject.slug,
            message: result.message,
          }),
        )
      } else {
        console.error(
          `✗ Failed to start ${projectPrefix}${serviceName}: ${result.message}`,
        )
      }
      return { success: false, message: result.message }
    }

    // Wait for service to start
    await new Promise((resolve) => setTimeout(resolve, 2000))

    // Get service response
    const response = await manager.getServiceResponse(serviceName, {
      includeLogs: true,
    })

    if (response?.status === 'running') {
      // Reconfigure gateway nginx configs
      await manager.reconfigureGateway()

      if (flags.json) {
        console.log(JSON.stringify(response))
      } else {
        const urlInfo = response.url ? ` → ${response.url}` : ''
        console.log(
          `✓ ${projectPrefix}${serviceName} started successfully${urlInfo}`,
        )
      }
      return { success: true, message: 'Service started successfully.' }
    }

    // Service failed to start
    if (flags.json) {
      console.log(JSON.stringify(response))
    } else {
      console.error(`✗ ${projectPrefix}${serviceName} failed to start`)
      if (response?.logs && response.logs.length > 0) {
        console.error('')
        console.error('Recent logs:')
        for (const line of response.logs) {
          console.error(`  ${line}`)
        }
      }
    }
    return { success: false, message: 'Service failed to start.' }
  },
})
