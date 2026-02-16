import { Command } from '../../lib/command.ts'
import { gatewayConfigureCommand } from './configure.ts'
import { gatewayStatusCommand } from './status.ts'

export const gatewayCommand = new Command({
  name: 'gateway',
  description: 'Manage nginx gateway proxy for local domains',
  usage: 'gateway <subcommand>',
  example: 'denvig gateway status',
  args: [],
  flags: [],
  subcommands: {
    status: gatewayStatusCommand,
    configure: gatewayConfigureCommand,
  },
  defaultSubcommand: 'status',
  handler: () => ({ success: true }),
})
