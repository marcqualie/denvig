import { z } from 'zod'

import { Command } from '../../lib/command.ts'
import { getServiceContext } from '../../lib/services/identifier.ts'
import { ServiceManager } from '../../lib/services/manager.ts'

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

      // Check if service is actually running
      const status = await manager.getServiceStatus(serviceName)
      if (status?.running) {
        const url = manager.getServiceUrl(serviceName)
        if (format === 'json') {
          console.log(
            JSON.stringify({
              success: true,
              service: serviceName,
              project: targetProject.slug,
              running: true,
              pid: status.pid,
              url: url || null,
            }),
          )
        } else {
          const urlInfo = url ? ` → ${url}` : ''
          console.log(
            `✓ ${projectPrefix}${serviceName} restarted successfully${urlInfo}`,
          )
        }
        return { success: true, message: 'Service restarted successfully.' }
      }

      // Service failed to start
      if (format === 'json') {
        console.log(
          JSON.stringify({
            success: false,
            service: serviceName,
            project: targetProject.slug,
            running: false,
            logs: status?.logs || [],
          }),
        )
      } else {
        console.error(`✗ ${projectPrefix}${serviceName} failed to start`)
        if (status?.logs && status.logs.length > 0) {
          console.error('')
          console.error('Recent logs:')
          for (const line of status.logs) {
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
        console.log(JSON.stringify({ success: true, services: [] }))
      } else {
        console.log('No running services to restart.')
      }
      return { success: true, message: 'No services to restart.' }
    }

    // Wait for services to start
    await new Promise((resolve) => setTimeout(resolve, 2000))

    const serviceResults: Array<{
      name: string
      success: boolean
      running: boolean
      url: string | null
      message?: string
    }> = []
    let hasErrors = false

    for (const result of results) {
      if (!result.success) {
        serviceResults.push({
          name: result.name,
          success: false,
          running: false,
          url: null,
          message: result.message,
        })
        if (format !== 'json') {
          console.error(`Restarting ${result.name}... ✗`)
          console.error(`  ${result.message}`)
        }
        hasErrors = true
        continue
      }

      // Check if service is actually running
      const status = await manager.getServiceStatus(result.name)
      if (status?.running) {
        const url = manager.getServiceUrl(result.name)
        serviceResults.push({
          name: result.name,
          success: true,
          running: true,
          url: url || null,
        })
        if (format !== 'json') {
          const urlInfo = url ? ` → ${url}` : ''
          console.log(`Restarting ${result.name}... ✓${urlInfo}`)
        }
      } else {
        serviceResults.push({
          name: result.name,
          success: false,
          running: false,
          url: null,
          message: 'Failed to start',
        })
        if (format !== 'json') {
          console.error(`Restarting ${result.name}... ✗ (failed to start)`)
          if (status?.logs && status.logs.length > 0) {
            console.error('  Recent logs:')
            for (const line of status.logs.slice(-3)) {
              console.error(`    ${line}`)
            }
          }
        }
        hasErrors = true
      }
    }

    if (format === 'json') {
      console.log(
        JSON.stringify({
          success: !hasErrors,
          project: project.slug,
          services: serviceResults,
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
