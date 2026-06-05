import {
  DenvigProject,
  getProjectInfo,
  type LaunchctlListItem,
  launchctl,
  listProjects,
  type ProjectInfo,
  type ProjectServiceStatus,
  prettyPath,
  type Worktree,
} from '@denvig/sdk'

import { Command } from '../../lib/command.ts'

type ProjectInfoJSON = Omit<ProjectInfo, 'serviceStatus'>

const getStatusIcon = (status: ProjectServiceStatus): string => {
  switch (status) {
    case 'running':
      return '🟢'
    case 'stopped':
      return '◯'
    default:
      return ''
  }
}

/** A row in the rendered list: a project, or one of its worktrees. */
type ProjectRow = {
  status: ProjectServiceStatus
  /** Project name for the primary row, branch name for worktree rows. */
  label: string
  path: string
  /** 0 for a project, 1 for one of its worktrees. */
  depth: number
}

/**
 * Group listed project paths into families keyed by primary checkout. Sibling
 * worktrees and the primary all collapse to a single family, so each project
 * appears once regardless of how many of its checkouts the glob matched.
 */
const groupIntoFamilies = async (paths: string[]): Promise<DenvigProject[]> => {
  const families = new Map<string, DenvigProject>()
  for (const path of paths) {
    const project = await DenvigProject.retrieve(path)
    const key = project.primaryWorktree.path
    if (!families.has(key)) {
      project.activeWorktree = project.primaryWorktree
      families.set(key, project)
    }
  }
  return [...families.values()].sort((a, b) =>
    a.primaryWorktree.path.localeCompare(b.primaryWorktree.path),
  )
}

/** Service status for a single worktree, reusing the shared info builder. */
const worktreeStatus = async (
  project: DenvigProject,
  worktree: Worktree,
  launchctlList: LaunchctlListItem[],
): Promise<ProjectServiceStatus> => {
  project.activeWorktree = worktree
  const info = await getProjectInfo(project, { launchctlList })
  return info.serviceStatus
}

export const projectsListCommand = new Command({
  name: 'projects:list',
  description: 'List all projects on the system',
  usage: 'projects list [--with-config]',
  example: 'projects list --json',
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
    const withConfig = flags['with-config'] as boolean
    const projectPaths = await listProjects({ withConfig })

    if (projectPaths.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        console.log('No projects found.')
      }
      return { success: true, message: 'No projects found.' }
    }

    const families = await groupIntoFamilies(projectPaths.map((p) => p.path))

    // JSON output: one entry per project family, worktrees nested via the
    // existing `worktrees` field. Skips launchctl calls for performance.
    if (flags.json) {
      const projects: ProjectInfoJSON[] = []
      for (const family of families) {
        const info = await getProjectInfo(family, {
          includeServiceStatus: false,
        })
        const { serviceStatus: _, ...infoWithoutStatus } = info
        projects.push(infoWithoutStatus)
      }
      console.log(JSON.stringify(projects))
      return { success: true, message: 'Projects listed successfully.' }
    }

    // CLI output: pre-fetch launchctl list once to avoid N shell calls.
    const launchctlList = await launchctl.list('denvig.')

    const rows: ProjectRow[] = []
    for (const family of families) {
      const worktrees = family.worktrees.filter((wt) => !wt.isPrimary)

      const primary = family.primaryWorktree
      rows.push({
        status: await worktreeStatus(family, primary, launchctlList),
        label: primary.config.name || primary.slug,
        path: primary.path,
        depth: 0,
      })

      for (const worktree of worktrees) {
        rows.push({
          status: await worktreeStatus(family, worktree, launchctlList),
          label: worktree.branch,
          path: worktree.path,
          depth: 1,
        })
      }
    }

    // Worktrees are nested under their project with a single `└` connector.
    const nameCell = (r: ProjectRow) => (r.depth > 0 ? `└ ${r.label}` : r.label)
    const nameWidth = Math.max(...rows.map((r) => nameCell(r).length))

    for (const r of rows) {
      // Service icon in a fixed left column, one space, the name (padded), one
      // space, then the path.
      const icon = getStatusIcon(r.status) || ' '
      const name = nameCell(r).padEnd(nameWidth)
      console.log(`${icon} ${name} ${prettyPath(r.path)}`)
    }

    console.log('')
    console.log(
      `${families.length} project${families.length === 1 ? '' : 's'} found`,
    )

    return { success: true, message: 'Projects listed successfully.' }
  },
})
