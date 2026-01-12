import { Command } from '../lib/command.ts'
import { formatTable } from '../lib/formatters/table.ts'
import { DenvigProject } from '../lib/project.ts'
import { listProjects } from '../lib/projects.ts'
import { type ServiceInfo, ServiceManager } from '../lib/services/manager.ts'

interface ServiceRow extends ServiceInfo {
  projectSlug?: string
  status: 'running' | 'error' | 'stopped'
  url: string
}

const getServiceStatus = async (
  service: ServiceInfo,
  manager: ServiceManager | null,
  projectSlug?: string,
): Promise<'running' | 'error' | 'stopped'> => {
  let targetManager = manager
  if (!targetManager && projectSlug) {
    const tempProject = new DenvigProject(projectSlug)
    targetManager = new ServiceManager(tempProject)
  }

  if (!targetManager) return 'stopped'

  const status = await targetManager.getServiceStatus(service.name)
  if (status?.running) {
    if (status.lastExitCode !== undefined && status.lastExitCode !== 0) {
      return 'error'
    }
    return 'running'
  }
  return 'stopped'
}

const getServiceUrl = (service: ServiceInfo): string => {
  if (service.domain) return `http://${service.domain}`
  if (service.port) return `http://localhost:${service.port}`
  return '-'
}

const getStatusIcon = (status: 'running' | 'error' | 'stopped'): string => {
  switch (status) {
    case 'running':
      return '🟢'
    case 'error':
      return '🔴'
    default:
      return '◯'
  }
}

export const servicesCommand = new Command({
  name: 'services',
  description: 'List all services defined in the project configuration',
  usage: 'services [--global] [--format table|json]',
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
    {
      name: 'format',
      description: 'Output format: table or json (default: table)',
      required: false,
      type: 'string',
      defaultValue: 'table',
    },
  ],
  handler: async ({ project, flags }) => {
    const isGlobal = flags.global as boolean
    const format = flags.format as string

    if (isGlobal) {
      const projects = listProjects()

      if (projects.length === 0) {
        if (format === 'json') {
          console.log(JSON.stringify([]))
        } else {
          console.log('No projects found with .denvig.yml configuration.')
        }
        return { success: true, message: 'No projects found.' }
      }

      const allServices: ServiceRow[] = []

      for (const projectSlug of projects) {
        const proj = new DenvigProject(projectSlug)
        const manager = new ServiceManager(proj)
        const services = await manager.listServices()

        for (const service of services) {
          const status = await getServiceStatus(service, null, projectSlug)
          allServices.push({
            ...service,
            projectSlug,
            status,
            url: getServiceUrl(service),
          })
        }
      }

      if (allServices.length === 0) {
        if (format === 'json') {
          console.log(JSON.stringify([]))
        } else {
          console.log('No services configured across any project.')
        }
        return { success: true, message: 'No services configured.' }
      }

      // JSON output
      if (format === 'json') {
        console.log(JSON.stringify(allServices))
        return {
          success: true,
          message: 'Global services listed successfully.',
        }
      }

      console.log('Services across all projects:')
      console.log('')

      const lines = formatTable({
        columns: [
          {
            header: '',
            accessor: (s) => getStatusIcon(s.status),
          },
          { header: 'Project', accessor: (s) => s.projectSlug || '' },
          { header: 'Name', accessor: (s) => s.name },
          {
            header: 'Command',
            accessor: (s) =>
              s.command.length > 20
                ? `${s.command.substring(0, 17)}...`
                : s.command,
          },
          { header: 'URL', accessor: (s) => s.url },
        ],
        data: allServices,
      })

      for (const line of lines) {
        console.log(line)
      }

      console.log('')
      console.log(
        `${allServices.length} service${allServices.length === 1 ? '' : 's'} configured across ${projects.length} project${projects.length === 1 ? '' : 's'}`,
      )

      return { success: true, message: 'Global services listed successfully.' }
    }

    const manager = new ServiceManager(project)
    const services = await manager.listServices()

    if (services.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify([]))
      } else {
        console.log('No services configured in this project.')
        console.log('')
        console.log(
          'Add services to your .denvig.yml configuration to get started.',
        )
      }
      return { success: true, message: 'No services configured.' }
    }

    const serviceRows: ServiceRow[] = []
    for (const service of services) {
      const status = await getServiceStatus(service, manager)
      serviceRows.push({
        ...service,
        status,
        url: getServiceUrl(service),
      })
    }

    // JSON output
    if (format === 'json') {
      console.log(JSON.stringify(serviceRows))
      return { success: true, message: 'Services listed successfully.' }
    }

    console.log(`Services for project: ${project.name}`)
    console.log('')

    const lines = formatTable({
      columns: [
        {
          header: '',
          accessor: (s) => getStatusIcon(s.status),
        },
        { header: 'Name', accessor: (s) => s.name },
        {
          header: 'Command',
          accessor: (s) =>
            s.command.length > 20
              ? `${s.command.substring(0, 17)}...`
              : s.command,
        },
        { header: 'URL', accessor: (s) => s.url },
      ],
      data: serviceRows,
    })

    for (const line of lines) {
      console.log(line)
    }

    console.log('')
    console.log(
      `${services.length} service${services.length === 1 ? '' : 's'} configured`,
    )

    return { success: true, message: 'Services listed successfully.' }
  },
})
