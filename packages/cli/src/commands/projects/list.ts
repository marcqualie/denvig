import { type LaunchctlListItem, launchctl } from '@denvig/sdk/unsafe'
import { prettyPath } from '@denvig/sdk/utils'

import { Command } from '../../lib/command.ts'

import type {
  DenvigProject,
  ProjectInfo,
  ProjectServiceStatus,
} from '@denvig/sdk'

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

/** Service status for a single worktree, reusing the shared info builder. */
const worktreeStatus = async (
  project: DenvigProject,
  branch: string,
  launchctlList: LaunchctlListItem[],
): Promise<ProjectServiceStatus> => {
  project.selectWorktree(branch)
  const info = await project.info({ launchctlList })
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
  handler: async ({ sdk, flags }) => {
    const withConfig = flags['with-config'] as boolean
    const families = await sdk.projects.list({ withConfig })

    if (families.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        console.log('No projects found.')
      }
      return { success: true, message: 'No projects found.' }
    }

    // JSON output: one entry per project family, worktrees nested via the
    // existing `worktrees` field. Skips launchctl calls for performance.
    if (flags.json) {
      const projects: ProjectInfoJSON[] = []
      for (const family of families) {
        const info = await family.info({ includeServiceStatus: false })
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
      const worktrees = family.worktrees.list().filter((wt) => !wt.isPrimary)

      const primary = family.primaryWorktree
      rows.push({
        status: await worktreeStatus(family, primary.branch, launchctlList),
        label: primary.config.name || primary.slug,
        path: primary.path,
        depth: 0,
      })

      for (const worktree of worktrees) {
        rows.push({
          status: await worktreeStatus(family, worktree.branch, launchctlList),
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
