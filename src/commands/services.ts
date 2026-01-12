import { Command } from '../lib/command.ts'
import { formatTable } from '../lib/formatters/table.ts'
import { DenvigProject } from '../lib/project.ts'
import { listProjects } from '../lib/projects.ts'
import { type ServiceInfo, ServiceManager } from '../lib/services/manager.ts'

interface ServiceRow extends ServiceInfo {
  projectSlug: string
  status: 'running' | 'error' | 'stopped'
  url: string
}

const getServiceStatus = async (
  service: ServiceInfo,
  projectSlug: string,
): Promise<'running' | 'error' | 'stopped'> => {
  const tempProject = new DenvigProject(projectSlug)
  const manager = new ServiceManager(tempProject)

  const status = await manager.getServiceStatus(service.name)
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
  description: 'List all services across all projects',
  usage: 'services [--format table|json]',
  example: 'services',
  args: [],
  flags: [
    {
      name: 'format',
      description: 'Output format: table or json (default: table)',
      required: false,
      type: 'string',
      defaultValue: 'table',
    },
  ],
  handler: async ({ project, flags }) => {
    const format = flags.format as string
    const currentProjectSlug = project.slug
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
        const status = await getServiceStatus(service, projectSlug)
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

    // Sort: current project first, then alphabetically by project slug
    const sortedServices = allServices.sort((a, b) => {
      const aIsCurrent = a.projectSlug === currentProjectSlug
      const bIsCurrent = b.projectSlug === currentProjectSlug

      if (aIsCurrent && !bIsCurrent) return -1
      if (!aIsCurrent && bIsCurrent) return 1

      const projectCompare = a.projectSlug.localeCompare(b.projectSlug)
      if (projectCompare !== 0) return projectCompare

      return a.name.localeCompare(b.name)
    })

    // JSON output
    if (format === 'json') {
      console.log(JSON.stringify(sortedServices))
      return { success: true, message: 'Services listed successfully.' }
    }

    const lines = formatTable({
      columns: [
        {
          header: '',
          accessor: (s) => getStatusIcon(s.status),
        },
        { header: 'Project', accessor: (s) => s.projectSlug },
        { header: 'Name', accessor: (s) => s.name },
        { header: 'URL', accessor: (s) => s.url },
      ],
      data: sortedServices,
    })

    for (const line of lines) {
      console.log(line)
    }

    console.log('')
    console.log(
      `${allServices.length} service${allServices.length === 1 ? '' : 's'} configured across ${projects.length} project${projects.length === 1 ? '' : 's'}`,
    )

    return { success: true, message: 'Services listed successfully.' }
  },
})
