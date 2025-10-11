import { Command } from '../lib/command.ts'
import { ServiceManager } from '../lib/services/manager.ts'

export const servicesCommand = new Command({
  name: 'services',
  description: 'List all services defined in the project configuration',
  usage: 'services',
  example: 'services',
  args: [],
  flags: [],
  handler: async ({ project }) => {
    const manager = new ServiceManager(project)
    const services = await manager.listServices()

    if (services.length === 0) {
      console.log('No services configured in this project.')
      console.log('')
      console.log(
        'Add services to your .denvig.yml configuration to get started.',
      )
      return { success: true, message: 'No services configured.' }
    }

    console.log(`Services for project: ${project.name}`)
    console.log('')

    // Calculate column widths for alignment
    const nameWidth = Math.max(
      ...services.map((s) => s.name.length),
      'NAME'.length,
    )
    const cwdWidth = Math.max(
      ...services.map((s) => s.cwd.length),
      'DIRECTORY'.length,
    )
    const commandWidth = Math.max(
      ...services.map((s) => s.command.length),
      'COMMAND'.length,
    )

    // Print each service with status
    for (const service of services) {
      const domain = service.domain
        ? `http://${service.domain}`
        : service.port
          ? `http://localhost:${service.port}`
          : '-'

      // Get service status
      const status = await manager.getServiceStatus(service.name)
      let statusIcon = '◯' // Not running

      if (status?.running) {
        // Check if there's a recent exit code indicating an error
        if (status.lastExitCode !== undefined && status.lastExitCode !== 0) {
          statusIcon = '🔴' // Running but had errors
        } else {
          statusIcon = '🟢' // Running successfully
        }
      }

      console.log(
        `${statusIcon} ${service.name.padEnd(nameWidth)}  ` +
          `${service.cwd.padEnd(cwdWidth)}  ` +
          `${service.command.padEnd(commandWidth)}  ` +
          `${domain}`,
      )
    }

    console.log('')
    console.log(
      `${services.length} service${services.length === 1 ? '' : 's'} configured`,
    )

    return { success: true, message: 'Services listed successfully.' }
  },
})
