import { Command } from '../../lib/command.ts'
import { zshCompleteCommand } from './__complete__.ts'

export const zshCommand = new Command({
  name: 'zsh',
  description: 'Zsh shell integration',
  usage: 'zsh <subcommand>',
  example: 'denvig completions zsh --install',
  args: [],
  flags: [],
  subcommands: {
    __complete__: zshCompleteCommand,
  },
  handler: () => {
    console.log('Usage: denvig zsh <subcommand>')
    console.log('')
    console.log('Subcommands:')
    console.log('  __complete__    Handle completion requests (internal)')
    return { success: true }
  },
})
