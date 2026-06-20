import {
  DenvigValidationError,
  type ServiceResponse,
  type ServiceRow,
} from '@denvig/sdk'

import { Command } from '../../lib/command.ts'
import { formatTable } from '../../lib/formatters/table.ts'

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
    'services list [--all] [--no-worktrees] [--global] [--worktree <branch>] [--status <status>]',
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
      name: 'no-worktrees',
      description:
        "Only list the current project's services, hiding the worktree services nested beneath them.",
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
  handler: async ({ project, flags }) => {
    const all = flags.all as boolean
    const globalOnly = flags.global as boolean
    const noWorktrees = flags['no-worktrees'] as boolean
    const worktreeFlag =
      typeof flags.worktree === 'string' ? flags.worktree : undefined
    const statusFlag =
      typeof flags.status === 'string' ? flags.status : undefined

    // Worktrees nest by default; --no-worktrees, --global and --worktree each
    // collapse to a single scope.
    const showWorktrees = !noWorktrees && !globalOnly && !worktreeFlag

    let filteredServices: ServiceRow[]
    try {
      filteredServices = await project.services.list({
        all,
        global: globalOnly,
        worktrees: showWorktrees,
        worktree: worktreeFlag,
        status: statusFlag,
      })
    } catch (e) {
      if (e instanceof DenvigValidationError) {
        const message = e.message
        if (flags.json) {
          console.log(JSON.stringify({ success: false, message }))
        } else {
          console.error(message)
        }
        return { success: false, message }
      }
      throw e
    }

    const statusFilter = statusFlag
      ? statusFlag.split(',').map((s) => s.trim().toLowerCase())
      : null

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

    const projectCount = new Set(
      filteredServices.filter((r) => r.depth === 0).map((r) => r.label),
    ).size

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
