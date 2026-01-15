import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { getServiceContext } from '../../lib/services/identifier.ts'
import launchctl from '../../lib/services/launchctl.ts'
import {
  ServiceManager,
  type ServiceResponse,
} from '../../lib/services/manager.ts'

export const servicesRestartCommand = new Command({
  name: 'services:restart',
  description: 'Restart all services or a specific service',
  usage: 'services restart [name] [--format table|json]',
  example: 'services restart api or services restart marcqualie/api/dev',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., hello or marcqualie/api/dev)',
      required: false,
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
  handler: async ({ project, args, flags }) => {
    const serviceArg = z.string().parse(args.name)
    const format = flags.format as string

    // Restart specific service or all services
    if (serviceArg) {
      const {
        manager,
        serviceName,
        project: targetProject,
      } = getServiceContext(serviceArg, project)

      const projectPrefix =
        targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

      if (format !== 'json') {
        console.log(`Restarting ${projectPrefix}${serviceName}...`)
      }

      const result = await manager.restartService(serviceName)

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
            `✗ Failed to restart ${projectPrefix}${serviceName}: ${result.message}`,
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
        if (format === 'json') {
          console.log(JSON.stringify(response))
        } else {
          const urlInfo = response.url ? ` → ${response.url}` : ''
          console.log(
            `✓ ${projectPrefix}${serviceName} restarted successfully${urlInfo}`,
          )
        }
        return { success: true, message: 'Service restarted successfully.' }
      }

      // Service failed to start
      if (format === 'json') {
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
    }

    // Restart all running services in current project
    const manager = new ServiceManager(project)
    const results = await manager.restartAll()

    if (results.length === 0) {
      if (format === 'json') {
        console.log(
          JSON.stringify({
            success: true,
            project: project.slug,
            services: [],
          }),
        )
      } else {
        console.log('No running services to restart.')
      }
      return { success: true, message: 'No services to restart.' }
    }

    // Wait for services to start
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const serviceResponses: ServiceResponse[] = []
    let hasErrors = false

    // Pre-fetch launchctl list once for batch lookup
    const launchctlList = await launchctl.list('denvig.')

    for (const result of results) {
      const response = await manager.getServiceResponse(result.name, {
        includeLogs: !result.success,
        launchctlList,
      })

      if (!response) {
        continue
      }

      serviceResponses.push(response)

      if (!result.success || response.status !== 'running') {
        hasErrors = true
        if (format !== 'json') {
          if (!result.success) {
            console.error(`Restarting ${result.name}... ✗`)
            console.error(`  ${result.message}`)
          } else {
            console.error(`Restarting ${result.name}... ✗ (failed to start)`)
            if (response.logs && response.logs.length > 0) {
              console.error('  Recent logs:')
              for (const line of response.logs.slice(-3)) {
                console.error(`    ${line}`)
              }
            }
          }
        }
      } else {
        if (format !== 'json') {
          const urlInfo = response.url ? ` → ${response.url}` : ''
          console.log(`Restarting ${result.name}... ✓${urlInfo}`)
        }
      }
    }

    if (format === 'json') {
      console.log(
        JSON.stringify({
          success: !hasErrors,
          project: project.slug,
          services: serviceResponses,
        }),
      )
    } else {
      console.log('')
      if (hasErrors) {
        console.log('Some services failed to restart')
      } else {
        console.log('All services restarted successfully')
      }
    }

    if (hasErrors) {
      return { success: false, message: 'Some services failed to restart.' }
    }
    return { success: true, message: 'All services restarted successfully.' }
  },
})
