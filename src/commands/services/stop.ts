import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { getServiceContext } from '../../lib/services/identifier.ts'

export const servicesStopCommand = new Command({
  name: 'services:stop',
  description: 'Stop a service',
  usage: 'services stop <name> [--format table|json]',
  example: 'services stop api',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., api or marcqualie/denvig/hello)',
      required: true,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'format',
      description: 'Output format: table or json (default: table)',
      required: false,
      type: 'string',
      defaultValue: 'table',
    },
  ],
  completions: ({ project }) => {
    return Object.keys(project.services)
  },
  handler: async ({ project, args, flags }) => {
    const serviceArg = z.string().parse(args.name)
    const format = flags.format as string

    const {
      manager,
      serviceName,
      project: targetProject,
    } = getServiceContext(serviceArg, project)

    const projectPrefix =
      targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

    if (format !== 'json') {
      console.log(`Stopping ${projectPrefix}${serviceName}...`)
    }

    const result = await manager.stopService(serviceName)

    if (!result.success) {
      if (format === 'json') {
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
          `✗ Failed to stop ${projectPrefix}${serviceName}: ${result.message}`,
        )
      }
      return { success: false, message: result.message }
    }

    // Get service response after stopping
    const response = await manager.getServiceResponse(serviceName)

    if (format === 'json') {
      console.log(JSON.stringify(response))
    } else {
      console.log(`✓ ${projectPrefix}${serviceName} stopped successfully`)
    }
    return { success: true, message: 'Service stopped successfully.' }
  },
})
