import { Command } from '../../lib/command.ts'
import { formatTable } from '../../lib/formatters/table.ts'
import { prettyPath } from '../../lib/path.ts'
import { DenvigProject } from '../../lib/project.ts'
import { getProjectInfo, type ProjectInfo } from '../../lib/projectInfo.ts'
import { listProjects } from '../../lib/projects.ts'
import launchctl from '../../lib/services/launchctl.ts'

const getStatusIcon = (status: ProjectInfo['serviceStatus']): string => {
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
  handler: async ({ flags }) => {
    const format = flags.format as string
    const withConfig = flags['with-config'] as boolean
    const projectPaths = listProjects({ withConfig })

    if (projectPaths.length === 0) {
      if (format === 'json') {
        console.log(JSON.stringify([]))
      } else {
        console.log('No projects found.')
      }
      return { success: true, message: 'No projects found.' }
    }

    // Pre-fetch launchctl list once to avoid N shell calls
    const launchctlList = await launchctl.list('denvig.')

    const projects: ProjectInfo[] = []

    for (const projectPath of projectPaths) {
      const proj = new DenvigProject(projectPath.path)
      const info = await getProjectInfo(proj, { launchctlList })
      projects.push(info)
    }

    // Sort by absolute path ascending
    const sortedProjects = projects.sort((a, b) => a.path.localeCompare(b.path))

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
