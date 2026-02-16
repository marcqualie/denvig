import { Command } from '../../../lib/command.ts'
import { certsCaInfoCommand } from './info.ts'
import { certsCaInstallCommand } from './install.ts'
import { certsCaUninstallCommand } from './uninstall.ts'

export const certsCaCommand = new Command({
  name: 'certs:ca',
  description: 'Manage the local Certificate Authority',
  usage: 'certs ca <subcommand>',
  example: 'denvig certs ca info',
  args: [],
  flags: [],
  subcommands: {
    install: certsCaInstallCommand,
    uninstall: certsCaUninstallCommand,
    info: certsCaInfoCommand,
  },
  defaultSubcommand: 'info',
  handler: certsCaInfoCommand.handler,
})
