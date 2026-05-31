import { Command } from '../../lib/command.ts'
import { projectsListCommand } from './list.ts'

export const projectsCommand = new Command({
  name: 'projects',
  description: 'Manage projects on the system',
  usage: 'projects <subcommand>',
  example: 'denvig projects list',
  args: [],
  flags: [],
  subcommands: {
    list: projectsListCommand,
  },
  defaultSubcommand: 'list',
  handler: () => ({ success: true }),
})
