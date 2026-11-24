import { Command } from '../../../lib/command.ts'
import { systemPortsInfoCommand } from './info.ts'
import { systemPortsKillCommand } from './kill.ts'
import { systemPortsListCommand } from './list.ts'

export const systemPortsCommand = new Command({
  name: 'system:ports',
  description: 'Inspect and free up TCP ports listening on this machine',
  usage: 'system ports <subcommand>',
  example: 'denvig system ports',
  args: [],
  flags: [],
  subcommands: {
    list: systemPortsListCommand,
    info: systemPortsInfoCommand,
    kill: systemPortsKillCommand,
  },
  defaultSubcommand: 'list',
  handler: () => ({ success: true }),
})
