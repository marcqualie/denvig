import { Command } from '../../lib/command.ts'
import { depsDedupeCommand } from './dedupe.ts'
import { depsListCommand } from './list.ts'
import { depsOutdatedCommand } from './outdated.ts'
import { depsWhyCommand } from './why.ts'

export const depsCommand = new Command({
  name: 'deps',
  description: 'Manage project dependencies',
  usage: 'deps <subcommand>',
  example: 'denvig deps list',
  args: [],
  flags: [],
  subcommands: {
    list: depsListCommand,
    outdated: depsOutdatedCommand,
    why: depsWhyCommand,
    dedupe: depsDedupeCommand,
  },
  defaultSubcommand: 'list',
  handler: () => ({ success: true }),
})
