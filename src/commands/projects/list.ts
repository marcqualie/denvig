import { Command } from '../../lib/command.ts'
import { formatTable } from '../../lib/formatters/table.ts'
import { prettyPath } from '../../lib/path.ts'
import { DenvigProject } from '../../lib/project.ts'
import { listProjects } from '../../lib/projects.ts'
import launchctl from '../../lib/services/launchctl.ts'
import { ServiceManager } from '../../lib/services/manager.ts'

import type { ProjectResponse } from '../../types/responses.ts'

type ProjectWithStatus = ProjectResponse & {
  serviceStatus: 'running' | 'stopped' | 'none'
}

const getStatusIcon = (status: 'running' | 'stopped' | 'none'): string => {
  switch (status) {
    case 'running':
      return '🟢'
    case 'stopped':
      return '◯'
    default:
      return ''
  }
}

export const projectsListCommand = new Command({
  name: 'projects',
  description: 'List all projects on the system',
  usage: 'projects [list] [--with-config]',
  example: 'projects --format json',
  args: [],
  flags: [
    {
      name: 'with-config',
      description: 'Only show projects with a .denvig.yml configuration file',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ project, flags }) => {
    const format = flags.format as string
    const withConfig = flags['with-config'] as boolean
    const currentProjectSlug = project.slug
    const projectSlugs = listProjects({ withConfig })

    if (projectSlugs.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify([]))
      } else {
        console.log('No projects found.')
      }
      return { success: true, message: 'No projects found.' }
    }

    // Pre-fetch launchctl list once to avoid N shell calls
    const launchctlList = await launchctl.list('denvig.')

    const projects: ProjectWithStatus[] = []

    for (const slug of projectSlugs) {
      const proj = new DenvigProject(slug)
      const hasConfig = proj.config.$sources.length > 0

      // Extract config without internal $sources property
      const { $sources: _, ...configWithoutSources } = proj.config

      // Determine service status
      let serviceStatus: 'running' | 'stopped' | 'none' = 'none'
      const services = proj.config.services || {}
      const serviceNames = Object.keys(services)

      if (serviceNames.length > 0) {
        // Check if any service is running
        const manager = new ServiceManager(proj)
        let hasRunningService = false

        for (const serviceName of serviceNames) {
          const response = await manager.getServiceResponse(serviceName, {
            launchctlList,
          })
          if (response?.status === 'running') {
            hasRunningService = true
            break
          }
        }

        serviceStatus = hasRunningService ? 'running' : 'stopped'
      }

      projects.push({
        slug,
        name: proj.name,
        path: proj.path,
        config: hasConfig ? configWithoutSources : null,
        serviceStatus,
      })
    }

    // Sort: current project first, then alphabetically by slug
    const sortedProjects = projects.sort((a, b) => {
      const aIsCurrent = a.slug === currentProjectSlug
      const bIsCurrent = b.slug === currentProjectSlug

      if (aIsCurrent && !bIsCurrent) return -1
      if (!aIsCurrent && bIsCurrent) return 1

      return a.slug.localeCompare(b.slug)
    })

    // JSON output
    if (format === 'json') {
      console.log(JSON.stringify(sortedProjects))
      return { success: true, message: 'Projects listed successfully.' }
    }

    const lines = formatTable({
      columns: [
        { header: '', accessor: (p) => getStatusIcon(p.serviceStatus) },
        { header: 'Name', accessor: (p) => p.config?.name || p.slug },
        { header: 'Path', accessor: (p) => prettyPath(p.path) },
      ],
      data: sortedProjects,
    })

    for (const line of lines) {
      console.log(line)
    }

    console.log('')
    console.log(
      `${projects.length} project${projects.length === 1 ? '' : 's'} found`,
    )

    return { success: true, message: 'Projects listed successfully.' }
  },
})
