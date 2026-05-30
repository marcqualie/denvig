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
import { resolveWorktree } from '../../lib/services/worktree.ts'

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
  usage:
    'services list [--all] [--worktrees] [--global] [--worktree <branch>] [--status <status>]',
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
      name: 'worktrees',
      description:
        "Nest each project's worktree services beneath it. Pair with --all to show worktrees for every project.",
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
    {
      name: 'status',
      description:
        'Filter by runtime status. Accepts a single value or a comma-separated list (running, stopped, error).',
      required: false,
      type: 'string',
    },
  ],
  completions: () => {
    return []
  },
  handler: async ({ project, worktree, flags }) => {
    const all = flags.all as boolean
    const globalOnly = flags.global as boolean
    const showWorktrees = flags.worktrees as boolean
    const worktreeFlag =
      typeof flags.worktree === 'string' ? flags.worktree : null
    const statusFlag = typeof flags.status === 'string' ? flags.status : null

    const validStatuses = new Set(['running', 'stopped', 'error'])
    const statusFilter = statusFlag
      ? statusFlag.split(',').map((s) => s.trim().toLowerCase())
      : null
    if (statusFilter) {
      const invalid = statusFilter.filter((s) => !validStatuses.has(s))
      if (invalid.length > 0) {
        const message = `Invalid --status value(s): ${invalid.join(', ')}. Allowed: running, stopped, error.`
        if (flags.json) {
          console.log(JSON.stringify({ success: false, message }))
        } else {
          console.error(message)
        }
        return { success: false, message }
      }
    }

    if ((all || globalOnly) && worktreeFlag !== null) {
      const message = '--worktree cannot be combined with --all or --global.'
      if (flags.json) {
        console.log(JSON.stringify({ success: false, message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    if (showWorktrees && (globalOnly || worktreeFlag !== null)) {
      const message =
        '--worktrees cannot be combined with --global or --worktree.'
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

    let activeWorktree = worktree
    if (worktreeFlag !== null) {
      try {
        activeWorktree = resolveWorktree(project, worktreeFlag)
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

    // A rendered row: a service plus where it sits in the project/worktree tree.
    type ServiceRow = {
      service: ServiceResponse
      /** 0 for a project's own services, 1 for a worktree's. */
      depth: 0 | 1
      /** Project column text: project slug at depth 0, branch at depth 1. */
      label: string
    }

    const collectFromManager = async (
      manager: ServiceManager,
      depth: 0 | 1,
      label: string,
      out: ServiceRow[],
    ) => {
      const services = await manager.listServices()
      services.sort((a, b) => a.name.localeCompare(b.name))
      for (const service of services) {
        const response = await manager.getServiceResponse(service.name, {
          launchctlList,
        })
        if (response) {
          out.push({ service: response, depth, label })
        }
      }
    }

    // Resolve a checkout's services into a name -> response map.
    const servicesByName = async (manager: ServiceManager) => {
      const map = new Map<string, ServiceResponse>()
      for (const service of await manager.listServices()) {
        const response = await manager.getServiceResponse(service.name, {
          launchctlList,
        })
        if (response) map.set(service.name, response)
      }
      return map
    }

    // Collect a project's services. With --worktrees, services are grouped by
    // name: the primary's instance first, then the same service from each
    // worktree nested beneath it.
    const collectFamily = async (family: DenvigProject, out: ServiceRow[]) => {
      const primary = family.primaryWorktree
      const primaryServices = await servicesByName(new ServiceManager(primary))

      if (!showWorktrees) {
        for (const name of [...primaryServices.keys()].sort()) {
          const service = primaryServices.get(name)
          if (service) out.push({ service, depth: 0, label: primary.slug })
        }
        return
      }

      const worktrees = []
      for (const wt of family.worktrees.filter((w) => !w.isPrimary)) {
        worktrees.push({
          branch: wt.branch,
          services: await servicesByName(new ServiceManager(wt)),
        })
      }

      const names = new Set<string>(primaryServices.keys())
      for (const wt of worktrees) {
        for (const name of wt.services.keys()) names.add(name)
      }

      for (const name of [...names].sort()) {
        const service = primaryServices.get(name)
        if (service) out.push({ service, depth: 0, label: primary.slug })
        for (const wt of worktrees) {
          const wtService = wt.services.get(name)
          if (wtService) {
            out.push({ service: wtService, depth: 1, label: wt.branch })
          }
        }
      }
    }

    // Group listed paths into families keyed by primary checkout so each
    // project appears once regardless of how many checkouts the glob matched.
    const familiesFromPaths = async (paths: string[]) => {
      const families = new Map<string, DenvigProject>()
      for (const path of paths) {
        const proj = await DenvigProject.retrieve(path)
        const key = proj.primaryWorktree.path
        if (!families.has(key)) families.set(key, proj)
      }
      return [...families.values()].sort((a, b) =>
        a.primaryWorktree.slug.localeCompare(b.primaryWorktree.slug),
      )
    }

    const allServices: ServiceRow[] = []
    let projectCount = 0

    if (globalOnly) {
      const globalProject = await createGlobalProject()
      if (Object.keys(globalProject.config.services || {}).length > 0) {
        projectCount = 1
        await collectFromManager(
          new ServiceManager(globalProject),
          0,
          globalProject.slug,
          allServices,
        )
      }
    } else if (all) {
      const families = await familiesFromPaths(
        (await listProjects()).map((p) => p.path),
      )
      for (const family of families) {
        await collectFamily(family, allServices)
      }
      projectCount = families.length

      const globalProject = await createGlobalProject()
      if (Object.keys(globalProject.config.services || {}).length > 0) {
        projectCount += 1
        await collectFromManager(
          new ServiceManager(globalProject),
          0,
          globalProject.slug,
          allServices,
        )
      }
    } else if (showWorktrees) {
      projectCount = 1
      await collectFamily(project, allServices)
    } else {
      projectCount = 1
      await collectFromManager(
        new ServiceManager(activeWorktree),
        0,
        activeWorktree.slug,
        allServices,
      )
    }

    const filteredServices = statusFilter
      ? allServices.filter((r) => statusFilter.includes(r.service.status))
      : allServices

    if (filteredServices.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else if (statusFilter) {
        console.log(`No services matching status: ${statusFilter.join(', ')}.`)
      } else if (globalOnly) {
        console.log('No global services configured.')
      } else if (all) {
        console.log('No services configured across any project.')
      } else {
        console.log(`No services configured for ${project.slug}.`)
      }
      return { success: true, message: 'No services configured.' }
    }

    if (flags.json) {
      console.log(JSON.stringify(filteredServices.map((r) => r.service)))
      return { success: true, message: 'Services listed successfully.' }
    }

    const showProjectColumn = all || globalOnly || showWorktrees
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
          accessor: (r) => getStatusIcon(r.service.status),
        },
        ...(showProjectColumn
          ? [
              {
                header: 'Project',
                // Worktrees are nested under their project with a single `└`
                // connector, matching `denvig projects`.
                accessor: (r: ServiceRow) =>
                  r.depth > 0 ? `└ ${r.label}` : r.label,
              },
            ]
          : []),
        { header: 'Name', accessor: (r: ServiceRow) => r.service.name },
        {
          header: 'URL',
          accessor: (r: ServiceRow) => formatUrlCell(r.service),
        },
      ],
      data: filteredServices,
    })

    for (const line of lines) {
      console.log(line)
    }

    console.log('')
    const shown = filteredServices.length
    const statusSuffix = statusFilter
      ? ` (filtered by status: ${statusFilter.join(', ')})`
      : ''
    if (all) {
      console.log(
        `${shown} service${shown === 1 ? '' : 's'} configured across ${projectCount} project${projectCount === 1 ? '' : 's'}${statusSuffix}`,
      )
    } else if (globalOnly) {
      console.log(
        `${shown} global service${shown === 1 ? '' : 's'} configured${statusSuffix}`,
      )
    } else {
      console.log(
        `${shown} service${shown === 1 ? '' : 's'} configured for ${project.slug}${statusSuffix}`,
      )
    }

    return { success: true, message: 'Services listed successfully.' }
  },
})
