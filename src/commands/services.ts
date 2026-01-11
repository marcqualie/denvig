import { Command } from '../lib/command.ts'
import { DenvigProject } from '../lib/project.ts'
import { listProjects } from '../lib/projects.ts'
import { type ServiceInfo, ServiceManager } from '../lib/services/manager.ts'

interface GlobalServiceInfo extends ServiceInfo {
  projectSlug: string
}

const printServices = async (
  services: ServiceInfo[] | GlobalServiceInfo[],
  manager: ServiceManager | null,
  isGlobal: boolean,
): Promise<void> => {
  // Calculate column widths for alignment
  const nameWidth = Math.max(
    ...services.map((s) => s.name.length),
    'NAME'.length,
  )
  const commandWidth = Math.min(
    20,
    Math.max(...services.map((s) => s.command.length), 'COMMAND'.length),
  )
  const projectWidth = isGlobal
    ? Math.max(
        ...services.map((s) => (s as GlobalServiceInfo).projectSlug.length),
        'PROJECT'.length,
      )
    : 0

  // Print each service with status
  for (const service of services) {
    const domain = service.domain
      ? `http://${service.domain}`
      : service.port
        ? `http://localhost:${service.port}`
        : '-'

    // Get service status
    let statusIcon = '◯' // Not running
    if (manager) {
      const status = await manager.getServiceStatus(service.name)
      if (status?.running) {
        if (status.lastExitCode !== undefined && status.lastExitCode !== 0) {
          statusIcon = '🔴' // Running but had errors
        } else {
          statusIcon = '🟢' // Running successfully
        }
      }
    } else if (isGlobal) {
      // For global view, create a temporary manager to check status
      const globalService = service as GlobalServiceInfo
      const tempProject = new DenvigProject(globalService.projectSlug)
      const tempManager = new ServiceManager(tempProject)
      const status = await tempManager.getServiceStatus(service.name)
      if (status?.running) {
        if (status.lastExitCode !== undefined && status.lastExitCode !== 0) {
          statusIcon = '🔴' // Running but had errors
        } else {
          statusIcon = '🟢' // Running successfully
        }
      }
    }

    const truncatedCommand =
      service.command.length > 20
        ? `${service.command.substring(0, 17)}...`
        : service.command

    const projectColumn = isGlobal
      ? `${(service as GlobalServiceInfo).projectSlug.padEnd(projectWidth)}  `
      : ''

    console.log(
      `${statusIcon} ${projectColumn}${service.name.padEnd(nameWidth)}  ` +
        `${truncatedCommand.padEnd(commandWidth)}  ` +
        `${domain}`,
    )
  }
}

export const servicesCommand = new Command({
  name: 'services',
  description: 'List all services defined in the project configuration',
  usage: 'services [--global]',
  example: 'services',
  args: [],
  flags: [
    {
      name: 'global',
      description: 'Show services from all projects',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ project, flags }) => {
    const isGlobal = flags.global as boolean

    if (isGlobal) {
      const projects = listProjects()

      if (projects.length === 0) {
        console.log('No projects found with .denvig.yml configuration.')
        return { success: true, message: 'No projects found.' }
      }

      const allServices: GlobalServiceInfo[] = []

      for (const projectSlug of projects) {
        const proj = new DenvigProject(projectSlug)
        const manager = new ServiceManager(proj)
        const services = await manager.listServices()

        for (const service of services) {
          allServices.push({
            ...service,
            projectSlug,
          })
        }
      }

      if (allServices.length === 0) {
        console.log('No services configured across any project.')
        return { success: true, message: 'No services configured.' }
      }

      console.log('Services across all projects:')
      console.log('')

      await printServices(allServices, null, true)

      console.log('')
      console.log(
        `${allServices.length} service${allServices.length === 1 ? '' : 's'} configured across ${projects.length} project${projects.length === 1 ? '' : 's'}`,
      )

      return { success: true, message: 'Global services listed successfully.' }
    }

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

    await printServices(services, manager, false)

    console.log('')
    console.log(
      `${services.length} service${services.length === 1 ? '' : 's'} configured`,
    )

    return { success: true, message: 'Services listed successfully.' }
  },
})
