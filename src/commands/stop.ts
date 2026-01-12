import { Command } from '../lib/command.ts'
import { getServiceContext } from '../lib/services/identifier.ts'
import { ServiceManager } from '../lib/services/manager.ts'

export const stopCommand = new Command({
  name: 'stop',
  description: 'Stop all services or a specific service',
  usage: 'stop [name]',
  example: 'stop api or stop marcqualie/api/dev',
  args: [
    {
      name: 'name',
      description:
        'Service name or project/service path (e.g., hello or marcqualie/api/dev)',
      required: false,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args }) => {
    // Stop specific service or all services
    if (typeof args.name === 'string' && args.name) {
      const {
        manager,
        serviceName,
        project: targetProject,
      } = getServiceContext(args.name, project)

      const projectPrefix =
        targetProject.slug !== project.slug ? `${targetProject.slug}/` : ''

      console.log(`Stopping ${projectPrefix}${serviceName}...`)
      const result = await manager.stopService(serviceName)

      if (result.success) {
        console.log(`✓ ${projectPrefix}${serviceName} stopped successfully`)
      } else {
        console.error(
          `✗ Failed to stop ${projectPrefix}${serviceName}: ${result.message}`,
        )
        return { success: false, message: result.message }
      }

      return { success: true, message: 'Service stopped successfully.' }
    }

    // Stop all services in current project
    const manager = new ServiceManager(project)
    const results = await manager.stopAll()

    if (results.length === 0) {
      console.log('No running services to stop.')
      return { success: true, message: 'No services to stop.' }
    }

    let hasErrors = false

    for (const result of results) {
      if (result.success) {
        console.log(`Stopping ${result.name}... ✓`)
      } else {
        console.error(`Stopping ${result.name}... ✗`)
        console.error(`  ${result.message}`)
        hasErrors = true
      }
    }

    console.log('')

    if (hasErrors) {
      console.log('Some services failed to stop')
      return { success: false, message: 'Some services failed to stop.' }
    }

    console.log('All services stopped successfully')
    return { success: true, message: 'All services stopped successfully.' }
  },
})
