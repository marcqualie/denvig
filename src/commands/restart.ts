import { Command } from '../lib/command.ts'
import { ServiceManager } from '../lib/services/manager.ts'

export const restartCommand = new Command({
  name: 'restart',
  description: 'Restart all services or a specific service',
  usage: 'restart [name]',
  example: 'restart api',
  args: [
    {
      name: 'name',
      description: 'Name of the service to restart (optional)',
      required: false,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args }) => {
    const manager = new ServiceManager(project)

    // Restart specific service or all services
    if (args.name) {
      console.log(`Restarting ${args.name}...`)
      const result = await manager.restartService(args.name)

      if (result.success) {
        console.log(`✓ ${args.name} restarted successfully`)
      } else {
        console.error(`✗ Failed to restart ${args.name}: ${result.message}`)
        return { success: false, message: result.message }
      }

      return { success: true, message: 'Service restarted successfully.' }
    }

    // Restart all running services
    const results = await manager.restartAll()

    if (results.length === 0) {
      console.log('No running services to restart.')
      return { success: true, message: 'No services to restart.' }
    }

    let hasErrors = false

    for (const result of results) {
      if (result.success) {
        console.log(`Restarting ${result.name}... ✓`)
      } else {
        console.error(`Restarting ${result.name}... ✗`)
        console.error(`  ${result.message}`)
        hasErrors = true
      }
    }

    console.log('')

    if (hasErrors) {
      console.log('Some services failed to restart')
      return { success: false, message: 'Some services failed to restart.' }
    }

    console.log('All services restarted successfully')
    return { success: true, message: 'All services restarted successfully.' }
  },
})
