import { Command } from '../../lib/command.ts'
import { systemConfigureCommand } from './configure.ts'
import { systemSetupCommand } from './setup.ts'
import { systemUpdateCommand } from './update.ts'

export const systemCommand = new Command({
  name: 'system',
  description: 'Manage the local system: dotfiles, packages, and tooling',
  usage: 'system <subcommand>',
  example: 'denvig system update',
  args: [],
  flags: [],
  subcommands: {
    setup: systemSetupCommand,
    update: systemUpdateCommand,
    configure: systemConfigureCommand,
  },
  handler: () => ({ success: true }),
})
