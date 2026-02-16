import { Command } from '../../lib/command.ts'
import { servicesListCommand } from './list.ts'
import { logsCommand } from './logs.ts'
import { servicesRestartCommand } from './restart.ts'
import { servicesStartCommand } from './start.ts'
import { servicesStatusCommand } from './status.ts'
import { servicesStopCommand } from './stop.ts'
import { servicesTeardownCommand } from './teardown.ts'

export const servicesCommand = new Command({
  name: 'services',
  description: 'Manage services across projects',
  usage: 'services <subcommand>',
  example: 'denvig services list',
  args: [],
  flags: [],
  subcommands: {
    list: servicesListCommand,
    start: servicesStartCommand,
    stop: servicesStopCommand,
    restart: servicesRestartCommand,
    status: servicesStatusCommand,
    logs: logsCommand,
    teardown: servicesTeardownCommand,
  },
  defaultSubcommand: 'list',
  handler: () => ({ success: true }),
})
