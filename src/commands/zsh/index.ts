import { Command } from '../../lib/command.ts'
import { zshCompleteCommand } from './__complete__.ts'
import { zshCompletionsCommand } from './completions.ts'

export const zshCommand = new Command({
  name: 'zsh',
  description: 'Zsh shell integration',
  usage: 'zsh <subcommand>',
  example: 'denvig zsh completions --install',
  args: [],
  flags: [],
  subcommands: {
    completions: zshCompletionsCommand,
    __complete__: zshCompleteCommand,
  },
  handler: () => {
    console.log('Usage: denvig zsh <subcommand>')
    console.log('')
    console.log('Subcommands:')
    console.log('  completions    Output zsh completion script')
    return { success: true }
  },
})
