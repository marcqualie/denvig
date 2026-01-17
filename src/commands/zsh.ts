import { Command } from '../lib/command.ts'

export const zshCommand = new Command({
  name: 'zsh',
  description: 'Zsh shell integration and completions',
  usage: 'zsh <subcommand>',
  example: 'zsh completions --install',
  args: [],
  flags: [],
  handler: () => {
    console.log('Zsh shell integration')
    console.log('')
    console.log('Available subcommands:')
    console.log('  completions    Output or install the zsh completion script')
    console.log(
      '  __complete__   Dynamic completion endpoint (used internally)',
    )
    console.log('')
    console.log('Usage:')
    console.log('  denvig zsh completions           # Output script to stdout')
    console.log(
      '  denvig zsh completions --install # Install to ~/.zsh/completions',
    )
    return { success: true }
  },
})
