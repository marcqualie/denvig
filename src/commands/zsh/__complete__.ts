import { Command } from '../../lib/command.ts'
import { getCommands } from '../../lib/zsh/commands.ts'
import { zshCompletionsFor } from '../../lib/zsh/completions.ts'

export const zshCompleteCommand = new Command({
  name: 'zsh:__complete__',
  description: 'Handle zsh completion requests (internal)',
  usage: 'zsh __complete__ -- <words...>',
  example: 'denvig zsh __complete__ -- denvig services',
  args: [],
  flags: [],
  handler: async ({ project, extraArgs = [] }) => {
    // Get the words passed after --
    const words = extraArgs

    // Get all commands for completion context
    const commands = await getCommands()

    // Get completions
    const completions = await zshCompletionsFor(words, { project, commands })

    // Output completions for zsh (one per line)
    // Escape colons as they are used as delimiters in zsh completions
    for (const completion of completions) {
      console.log(completion.replace(/:/g, '\\:'))
    }

    return { success: true }
  },
})
