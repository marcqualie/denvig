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
  description: 'List services for the current project',
  usage: 'services list [--all] [--global]',
  example: 'services list',
  args: [],
  flags: [
    {
      name: 'all',
      description: 'List services across all projects and global services',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
    {
      name: 'global',
      description: 'List only global services',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  completions: () => {
    return []
  },
  handler: async ({ project, flags }) => {
    const all = flags.all as boolean
    const globalOnly = flags.global as boolean

    if (all && globalOnly) {
      const message = 'Cannot use --all and --global together.'
      if (flags.json) {
        console.log(JSON.stringify({ success: false, message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    // Pre-fetch launchctl list once to avoid N shell calls
    const launchctlList = await launchctl.list('denvig.')

    const collectFromManager = async (
      manager: ServiceManager,
      out: ServiceResponse[],
    ) => {
      const services = await manager.listServices()
      for (const service of services) {
        const response = await manager.getServiceResponse(service.name, {
          launchctlList,
        })
        if (response) {
          out.push(response)
        }
      }
    }

    const allServices: ServiceResponse[] = []
    let projectCount = 0

    if (globalOnly) {
      const globalProject = await createGlobalProject()
      if (Object.keys(globalProject.config.services || {}).length > 0) {
        projectCount = 1
        await collectFromManager(new ServiceManager(globalProject), allServices)
      }
    } else if (all) {
      const projectInfos = await listProjects()
      for (const projectInfo of projectInfos) {
        const proj = await DenvigProject.retrieve(projectInfo.path)
        await collectFromManager(new ServiceManager(proj), allServices)
      }
      projectCount = projectInfos.length

      const globalProject = await createGlobalProject()
      if (Object.keys(globalProject.config.services || {}).length > 0) {
        projectCount += 1
        await collectFromManager(new ServiceManager(globalProject), allServices)
      }
    } else {
      projectCount = 1
      await collectFromManager(new ServiceManager(project), allServices)
    }

    if (allServices.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        if (globalOnly) {
          console.log('No global services configured.')
        } else if (all) {
          console.log('No services configured across any project.')
        } else {
          console.log(`No services configured for ${project.slug}.`)
        }
      }
      return { success: true, message: 'No services configured.' }
    }

    const currentProjectSlug = project.slug
    const sortedServices = allServices.sort((a, b) => {
      const aIsCurrent = a.project.slug === currentProjectSlug
      const bIsCurrent = b.project.slug === currentProjectSlug

      if (aIsCurrent && !bIsCurrent) return -1
      if (!aIsCurrent && bIsCurrent) return 1

      const projectCompare = a.project.slug.localeCompare(b.project.slug)
      if (projectCompare !== 0) return projectCompare

      return a.name.localeCompare(b.name)
    })

    if (flags.json) {
      console.log(JSON.stringify(sortedServices))
      return { success: true, message: 'Services listed successfully.' }
    }

    const showProjectColumn = all || globalOnly
    const lines = formatTable({
      columns: [
        {
          header: '',
          accessor: (s) => getStatusIcon(s.status),
        },
        ...(showProjectColumn
          ? [
              {
                header: 'Project',
                accessor: (s: ServiceResponse) => s.project.slug,
              },
            ]
          : []),
        { header: 'Name', accessor: (s: ServiceResponse) => s.name },
        { header: 'URL', accessor: (s: ServiceResponse) => s.url || '-' },
      ],
      data: sortedServices,
    })

    for (const line of lines) {
      console.log(line)
    }

    console.log('')
    if (all) {
      console.log(
        `${allServices.length} service${allServices.length === 1 ? '' : 's'} configured across ${projectCount} project${projectCount === 1 ? '' : 's'}`,
      )
    } else if (globalOnly) {
      console.log(
        `${allServices.length} global service${allServices.length === 1 ? '' : 's'} configured`,
      )
    } else {
      console.log(
        `${allServices.length} service${allServices.length === 1 ? '' : 's'} configured for ${project.slug}`,
      )
    }

    return { success: true, message: 'Services listed successfully.' }
  },
})
