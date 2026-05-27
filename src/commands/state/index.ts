import { Command } from '../../lib/command.ts'
import { stateSyncCommand } from './sync.ts'

export const stateCommand = new Command({
  name: 'state',
  description:
    'Manage the denvig state file (~/.denvig/state.json) — the source of truth for running services',
  usage: 'state <subcommand>',
  example: 'denvig state sync',
  args: [],
  flags: [],
  subcommands: {
    sync: stateSyncCommand,
  },
  defaultSubcommand: 'sync',
  handler: () => ({ success: true }),
})
