import { Command } from '../lib/command.ts'
import { prettyPath } from '../lib/path.ts'
import { getProjectInfo } from '../lib/projectInfo.ts'

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

export const infoCommand = new Command({
  name: 'info',
  description: 'Show information about the current project',
  usage: 'info',
  example: 'denvig info',
  args: [],
  flags: [],
  handler: async ({ project, flags }) => {
    const info = await getProjectInfo(project)

    if (flags.json) {
      console.log(JSON.stringify(info))
      return { success: true }
    }

    const statusIcon = getStatusIcon(info.serviceStatus)
    const statusText = statusIcon ? `${statusIcon} ` : ''

    console.log(`${statusText}${info.config?.name || info.slug}`)
    console.log(`   Path: ${prettyPath(info.path)}`)
    console.log(`   Slug: ${info.slug}`)
    console.log(`     ID: ${info.id}`)
    if (info.refs.length > 0) {
      console.log(`   Refs: ${info.refs[0]}`)
      for (const ref of info.refs.slice(1)) {
        console.log(`         ${ref}`)
      }
    }
    if (info.worktrees.length > 0) {
      const format = (wt: { branch: string; path: string }) =>
        `${wt.path} (${wt.branch})`
      console.log(' ')
      console.log(`  Worktrees:`)
      for (const worktree of info.worktrees) {
        console.log(`         ${format(worktree)}`)
      }
    }

    return { success: true }
  },
})
