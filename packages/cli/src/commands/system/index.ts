import { Command } from '../../lib/command.ts'
import { systemConfigureCommand } from './configure.ts'
import { systemPortsCommand } from './ports/index.ts'
import { systemSetupCommand } from './setup.ts'
import { systemUpdateCommand } from './update.ts'

export const systemCommand = new Command({
  name: 'system',
  description:
    'Manage the local system: dotfiles, packages, tooling, and ports',
  usage: 'system <subcommand>',
  example: 'denvig system update',
  args: [],
  flags: [],
  subcommands: {
    setup: systemSetupCommand,
    update: systemUpdateCommand,
    configure: systemConfigureCommand,
    ports: systemPortsCommand,
  },
  handler: () => ({ success: true }),
})
