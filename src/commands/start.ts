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

      if (!result.success) {
        console.error(`✗ Failed to start ${args.name}: ${result.message}`)
        return { success: false, message: result.message }
      }

      // Wait for service to start
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Check if service is actually running
      const status = await manager.getServiceStatus(args.name)
      if (status?.running) {
        const url = manager.getServiceUrl(args.name)
        const urlInfo = url ? ` → ${url}` : ''
        console.log(`✓ ${args.name} started successfully${urlInfo}`)
        return { success: true, message: 'Service started successfully.' }
      }

      // Service failed to start - show logs
      console.error(`✗ ${args.name} failed to start`)
      if (status?.logs && status.logs.length > 0) {
        console.error('')
        console.error('Recent logs:')
        for (const line of status.logs) {
          console.error(`  ${line}`)
        }
      }
      return { success: false, message: 'Service failed to start.' }
    }

    // Start all services
    const services = await manager.listServices()

    if (services.length === 0) {
      console.log('No services configured in this project.')
      return { success: true, message: 'No services to start.' }
    }

    const results = await manager.startAll()

    // Wait for services to start
    await new Promise((resolve) => setTimeout(resolve, 2000))

    let hasErrors = false

    for (const result of results) {
      if (!result.success) {
        console.error(`Starting ${result.name}... ✗`)
        console.error(`  ${result.message}`)
        hasErrors = true
        continue
      }

      // Check if service is actually running
      const status = await manager.getServiceStatus(result.name)
      if (status?.running) {
        const url = manager.getServiceUrl(result.name)
        const urlInfo = url ? ` → ${url}` : ''
        console.log(`Starting ${result.name}... ✓${urlInfo}`)
      } else {
        console.error(`Starting ${result.name}... ✗ (failed to start)`)
        if (status?.logs && status.logs.length > 0) {
          console.error('  Recent logs:')
          for (const line of status.logs.slice(-3)) {
            console.error(`    ${line}`)
          }
        }
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
