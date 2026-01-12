import { Command } from '../../lib/command.ts'
import { getServiceContext } from '../../lib/services/identifier.ts'
import { ServiceManager } from '../../lib/services/manager.ts'

export const servicesStopCommand = new Command({
  name: 'services:stop',
  description: 'Stop all services or a specific service',
  usage: 'services stop [name] [--format table|json]',
  example: 'services stop api or services stop marcqualie/api/dev',
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
    const format = flags.format as string

    // Stop specific service or all services
    if (typeof args.name === 'string' && args.name) {
      const {
        manager,
        serviceName,
        project: targetProject,
      } = getServiceContext(args.name, project)

      const projectPrefix =
        targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

      if (format !== 'json') {
        console.log(`Stopping ${projectPrefix}${serviceName}...`)
      }

      const result = await manager.stopService(serviceName)

      if (result.success) {
        if (format === 'json') {
          console.log(
            JSON.stringify({
              success: true,
              service: serviceName,
              project: targetProject.slug,
            }),
          )
        } else {
          console.log(`✓ ${projectPrefix}${serviceName} stopped successfully`)
        }
        return { success: true, message: 'Service stopped successfully.' }
      }

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

    // Stop all services in current project
    const manager = new ServiceManager(project)
    const results = await manager.stopAll()

    if (results.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify({ success: true, services: [] }))
      } else {
        console.log('No running services to stop.')
      }
      return { success: true, message: 'No services to stop.' }
    }

    const serviceResults: Array<{
      name: string
      success: boolean
      message?: string
    }> = []
    let hasErrors = false

    for (const result of results) {
      if (result.success) {
        serviceResults.push({ name: result.name, success: true })
        if (format !== 'json') {
          console.log(`Stopping ${result.name}... ✓`)
        }
      } else {
        serviceResults.push({
          name: result.name,
          success: false,
          message: result.message,
        })
        if (format !== 'json') {
          console.error(`Stopping ${result.name}... ✗`)
          console.error(`  ${result.message}`)
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
        console.log('Some services failed to stop')
      } else {
        console.log('All services stopped successfully')
      }
    }

    if (hasErrors) {
      return { success: false, message: 'Some services failed to stop.' }
    }
    return { success: true, message: 'All services stopped successfully.' }
  },
})
