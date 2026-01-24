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

    if (flags.format === 'json') {
      console.log(JSON.stringify(info))
      return { success: true }
    }

    const statusIcon = getStatusIcon(info.serviceStatus)
    const statusText = statusIcon ? `${statusIcon} ` : ''

    console.log(`${statusText}${info.config?.name || info.slug}`)
    console.log(`   Path: ${prettyPath(info.path)}`)
    console.log(`   Slug: ${info.slug}`)

    return { success: true }
  },
})
