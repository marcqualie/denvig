import { Command } from '../lib/command.ts'
import { ServiceManager } from '../lib/services/manager.ts'

export const stopCommand = new Command({
  name: 'stop',
  description: 'Stop all services or a specific service',
  usage: 'stop [name]',
  example: 'stop api',
  args: [
    {
      name: 'name',
      description: 'Name of the service to stop (optional)',
      required: false,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args }) => {
    const manager = new ServiceManager(project)

    // Stop specific service or all services
    if (typeof args.name === 'string' && args.name) {
      console.log(`Stopping ${args.name}...`)
      const result = await manager.stopService(args.name)

      if (result.success) {
        console.log(`✓ ${args.name} stopped successfully`)
      } else {
        console.error(`✗ Failed to stop ${args.name}: ${result.message}`)
        return { success: false, message: result.message }
      }

      return { success: true, message: 'Service stopped successfully.' }
    }

    // Stop all services
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
