import { z } from 'zod'

import { Command } from '../lib/command.ts'
import { getServiceContext } from '../lib/services/identifier.ts'
import { ServiceManager } from '../lib/services/manager.ts'

export const startCommand = new Command({
  name: 'start',
  description: 'Start all services or a specific service',
  usage: 'start [name] [--format table|json]',
  example: 'start api or start marcqualie/api/dev',
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
    // Parse service name from args (ensures it's a string)
    const serviceArg = z.string().parse(args.name)
    const format = flags.format as string

    // Start specific service or all services
    if (serviceArg) {
      const {
        manager,
        serviceName,
        project: targetProject,
      } = getServiceContext(serviceArg, project)

      const projectPrefix =
        targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

      if (format !== 'json') {
        console.log(`Starting ${projectPrefix}${serviceName}...`)
      }

      const result = await manager.startService(serviceName)

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
            `✗ Failed to start ${projectPrefix}${serviceName}: ${result.message}`,
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
            `✓ ${projectPrefix}${serviceName} started successfully${urlInfo}`,
          )
        }
        return { success: true, message: 'Service started successfully.' }
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

    // Start all services in current project
    const manager = new ServiceManager(project)
    const services = await manager.listServices()

    if (services.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: true, services: [] }))
      } else {
        console.log('No services configured in this project.')
      }
      return { success: true, message: 'No services to start.' }
    }

    const results = await manager.startAll()

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
          console.error(`Starting ${result.name}... ✗`)
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
          console.log(`Starting ${result.name}... ✓${urlInfo}`)
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
          console.error(`Starting ${result.name}... ✗ (failed to start)`)
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
        console.log('Some services failed to start')
      } else {
        console.log('All services started successfully')
      }
    }

    if (hasErrors) {
      return { success: false, message: 'Some services failed to start.' }
    }
    return { success: true, message: 'All services started successfully.' }
  },
})
