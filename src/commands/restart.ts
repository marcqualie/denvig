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

      if (!result.success) {
        console.error(`✗ Failed to restart ${args.name}: ${result.message}`)
        return { success: false, message: result.message }
      }

      // Wait for service to start
      await new Promise((resolve) => setTimeout(resolve, 2000))

      // Check if service is actually running
      const status = await manager.getServiceStatus(args.name)
      if (status?.running) {
        const url = manager.getServiceUrl(args.name)
        const urlInfo = url ? ` → ${url}` : ''
        console.log(`✓ ${args.name} restarted successfully${urlInfo}`)
        return { success: true, message: 'Service restarted successfully.' }
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

    // Restart all running services
    const results = await manager.restartAll()

    if (results.length === 0) {
      console.log('No running services to restart.')
      return { success: true, message: 'No services to restart.' }
    }

    // Wait for services to start
    await new Promise((resolve) => setTimeout(resolve, 2000))

    let hasErrors = false

    for (const result of results) {
      if (!result.success) {
        console.error(`Restarting ${result.name}... ✗`)
        console.error(`  ${result.message}`)
        hasErrors = true
        continue
      }

      // Check if service is actually running
      const status = await manager.getServiceStatus(result.name)
      if (status?.running) {
        const url = manager.getServiceUrl(result.name)
        const urlInfo = url ? ` → ${url}` : ''
        console.log(`Restarting ${result.name}... ✓${urlInfo}`)
      } else {
        console.error(`Restarting ${result.name}... ✗ (failed to start)`)
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
      console.log('Some services failed to restart')
      return { success: false, message: 'Some services failed to restart.' }
    }

    console.log('All services restarted successfully')
    return { success: true, message: 'All services restarted successfully.' }
  },
})
