import { Command } from '../../lib/command.ts'
import { certsCaCommand } from './ca/index.ts'
import { certsGenerateCommand } from './generate.ts'
import { certsImportCommand } from './import.ts'
import { certsInitCommand } from './init.ts'
import { certsListCommand } from './list.ts'
import { certsRmCommand } from './rm.ts'

export const certsCommand = new Command({
  name: 'certs',
  description: 'Manage local TLS certificates',
  usage: 'certs <subcommand>',
  example: 'denvig certs list',
  args: [],
  flags: [],
  subcommands: {
    list: certsListCommand,
    ca: certsCaCommand,
    init: certsInitCommand,
    generate: certsGenerateCommand,
    import: certsImportCommand,
    rm: certsRmCommand,
  },
  defaultSubcommand: 'list',
  handler: () => ({ success: true }),
})
