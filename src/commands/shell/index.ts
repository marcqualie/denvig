import { Command } from '../../lib/command.ts'
import { shellCompleteCommand } from './__complete__.ts'
import { shellCompletionsCommand } from './completions.ts'

export const shellCommand = new Command({
  name: 'shell',
  description: 'Shell integration helpers',
  usage: 'shell <subcommand>',
  example: 'denvig shell completions zsh --install',
  args: [],
  flags: [],
  subcommands: {
    completions: shellCompletionsCommand,
    __complete__: shellCompleteCommand,
  },
  handler: () => {
    console.log('Usage: denvig shell <subcommand>')
    console.log('')
    console.log('Subcommands:')
    console.log('  completions    Output a shell completion script')
    return { success: true }
  },
})
