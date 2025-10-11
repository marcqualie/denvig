import { Command } from '../lib/command.ts'
import { ServiceManager } from '../lib/services/manager.ts'

export const startCommand = new Command({
  name: 'start',
  description: 'Start all services or a specific service',
  usage: 'start [name]',
  example: 'start api',
  args: [
    {
      name: 'name',
      description: 'Name of the service to start (optional)',
      required: false,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args }) => {
    const manager = new ServiceManager(project)

    // Start specific service or all services
    if (args.name) {
      console.log(`Starting ${args.name}...`)
      const result = await manager.startService(args.name)

      if (result.success) {
        console.log(`✓ ${args.name} started successfully`)
      } else {
        console.error(`✗ Failed to start ${args.name}: ${result.message}`)
        return { success: false, message: result.message }
      }

      return { success: true, message: 'Service started successfully.' }
    }

    // Start all services
    const services = await manager.listServices()

    if (services.length === 0) {
      console.log('No services configured in this project.')
      return { success: true, message: 'No services to start.' }
    }

    const results = await manager.startAll()
    let hasErrors = false

    for (const result of results) {
      if (result.success) {
        console.log(`Starting ${result.name}... ✓`)
      } else {
        console.error(`Starting ${result.name}... ✗`)
        console.error(`  ${result.message}`)
        hasErrors = true
      }
    }

    console.log('')

    if (hasErrors) {
      console.log('Some services failed to start')
      return { success: false, message: 'Some services failed to start.' }
    }

    console.log('All services started successfully')
    return { success: true, message: 'All services started successfully.' }
  },
})
