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
import { resolveWorktreeProject } from '../../lib/services/worktree.ts'

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
  usage: 'services list [--all] [--global] [--worktree <branch>]',
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
    {
      name: 'worktree',
      description:
        'List services for a sibling git worktree by branch name (use "main" for the primary checkout). Pair with the global --project flag to target a worktree of another project.',
      required: false,
      type: 'string',
    },
  ],
  completions: () => {
    return []
  },
  handler: async ({ project: currentProject, flags }) => {
    const all = flags.all as boolean
    const globalOnly = flags.global as boolean
    const worktreeFlag =
      typeof flags.worktree === 'string' ? flags.worktree : null

    if ((all || globalOnly) && worktreeFlag !== null) {
      const message = '--worktree cannot be combined with --all or --global.'
      if (flags.json) {
        console.log(JSON.stringify({ success: false, message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    if (all && globalOnly) {
      const message = 'Cannot combine --all and --global. Choose one.'
      if (flags.json) {
        console.log(JSON.stringify({ success: false, message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    let project = currentProject
    if (worktreeFlag !== null) {
      try {
        project = await resolveWorktreeProject(currentProject, worktreeFlag)
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        if (flags.json) {
          console.log(JSON.stringify({ success: false, message }))
        } else {
          console.error(message)
        }
        return { success: false, message }
      }
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
    const formatUrlCell = (s: ServiceResponse): string => {
      if (!s.url) return '-'
      const showLocal =
        s.localUrl &&
        s.localUrl !== s.url &&
        (s.configPort === null || s.configPort !== s.port)
      return showLocal ? `${s.url}  ${s.localUrl}` : s.url
    }
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
        { header: 'URL', accessor: formatUrlCell },
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
