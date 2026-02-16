import { Command } from '../../lib/command.ts'
import { gatewayConfigureCommand } from './configure.ts'
import { gatewayGenerateCertsCommand } from './generate-certs.ts'
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
    'generate-certs': gatewayGenerateCertsCommand,
  },
  defaultSubcommand: 'status',
  handler: () => ({ success: true }),
})
