import { Command } from '../../lib/command.ts'
import { formatTable } from '../../lib/formatters/table.ts'
import { DenvigProject } from '../../lib/project.ts'
import { listProjects } from '../../lib/projects.ts'
import { createGlobalProject } from '../../lib/services/global.ts'
import launchctl from '../../lib/services/launchctl.ts'
import {
  ServiceManager,
  type ServiceResponse,
} from '../../lib/services/manager.ts'

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

export const servicesListCommand = new Command({
  name: 'services:list',
  description: 'List all services across all projects',
  usage: 'services list',
  example: 'services list',
  args: [],
  flags: [],
  completions: () => {
    return []
  },
  handler: async ({ project, flags }) => {
    const currentProjectSlug = project.slug
    const projectInfos = await listProjects()

    if (projectInfos.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        console.log('No projects found with .denvig.yml configuration.')
      }
      return { success: true, message: 'No projects found.' }
    }

    // Pre-fetch launchctl list once to avoid N shell calls
    const launchctlList = await launchctl.list('denvig.')

    const allServices: ServiceResponse[] = []

    for (const projectInfo of projectInfos) {
      const proj = await DenvigProject.retrieve(projectInfo.path)
      const manager = new ServiceManager(proj)
      const services = await manager.listServices()

      for (const service of services) {
        const response = await manager.getServiceResponse(service.name, {
          launchctlList,
        })
        if (response) {
          allServices.push(response)
        }
      }
    }

    // Include global services
    const globalProject = await createGlobalProject()
    const globalServices = globalProject.config.services || {}
    if (Object.keys(globalServices).length > 0) {
      const globalManager = new ServiceManager(globalProject)
      const globalServiceList = await globalManager.listServices()
      for (const service of globalServiceList) {
        const response = await globalManager.getServiceResponse(service.name, {
          launchctlList,
        })
        if (response) {
          allServices.push(response)
        }
      }
    }

    if (allServices.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        console.log('No services configured across any project.')
      }
      return { success: true, message: 'No services configured.' }
    }

    // Sort: current project first, then alphabetically by project slug
    const sortedServices = allServices.sort((a, b) => {
      const aIsCurrent = a.project.slug === currentProjectSlug
      const bIsCurrent = b.project.slug === currentProjectSlug

      if (aIsCurrent && !bIsCurrent) return -1
      if (!aIsCurrent && bIsCurrent) return 1

      const projectCompare = a.project.slug.localeCompare(b.project.slug)
      if (projectCompare !== 0) return projectCompare

      return a.name.localeCompare(b.name)
    })

    // JSON output
    if (flags.json) {
      console.log(JSON.stringify(sortedServices))
      return { success: true, message: 'Services listed successfully.' }
    }

    const lines = formatTable({
      columns: [
        {
          header: '',
          accessor: (s) => getStatusIcon(s.status),
        },
        { header: 'Project', accessor: (s) => s.project.slug },
        { header: 'Name', accessor: (s) => s.name },
        { header: 'URL', accessor: (s) => s.url || '-' },
      ],
      data: sortedServices,
    })

    for (const line of lines) {
      console.log(line)
    }

    const totalProjects =
      projectInfos.length +
      (Object.keys(globalProject.config.services || {}).length > 0 ? 1 : 0)
    console.log('')
    console.log(
      `${allServices.length} service${allServices.length === 1 ? '' : 's'} configured across ${totalProjects} project${totalProjects === 1 ? '' : 's'}`,
    )

    return { success: true, message: 'Services listed successfully.' }
  },
})
