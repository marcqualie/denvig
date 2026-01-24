import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { getServiceContext } from '../../lib/services/identifier.ts'

export const servicesStopCommand = new Command({
  name: 'services:stop',
  description: 'Stop a service',
  usage: 'services stop <name>',
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
  flags: [],
  completions: ({ project }) => {
    return Object.keys(project.services)
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
      console.log(`Stopping ${projectPrefix}${serviceName}...`)
    }

    const result = await manager.stopService(serviceName)

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
          `✗ Failed to stop ${projectPrefix}${serviceName}: ${result.message}`,
        )
      }
      return { success: false, message: result.message }
    }

    // Get service response after stopping
    const response = await manager.getServiceResponse(serviceName)

    if (flags.json) {
      console.log(JSON.stringify(response))
    } else {
      console.log(`✓ ${projectPrefix}${serviceName} stopped successfully`)
    }
    return { success: true, message: 'Service stopped successfully.' }
  },
})
