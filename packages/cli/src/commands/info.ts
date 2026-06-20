import { prettyPath } from '@denvig/sdk/utils'

import { Command } from '../lib/command.ts'
import { statusIcon } from '../lib/formatters/status-icon.ts'

export const infoCommand = new Command({
  name: 'info',
  description: 'Show information about the current project',
  usage: 'info',
  example: 'denvig info',
  args: [],
  flags: [],
  handler: async ({ project, flags }) => {
    const info = await project.info()

    if (flags.json) {
      console.log(JSON.stringify(info))
      return { success: true }
    }

    const icon = statusIcon(info.serviceStatus)
    const statusText = icon ? `${icon} ` : ''

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
