import { Command } from '../../lib/command.ts'
import { getCommands } from '../../lib/zsh/commands.ts'
import { zshCompletionsFor } from '../../lib/zsh/completions.ts'

export const shellCompleteCommand = new Command({
  name: 'shell:__complete__',
  description: 'Handle shell completion requests (internal)',
  usage: 'shell __complete__ -- <words...>',
  example: 'denvig shell __complete__ -- denvig services',
  args: [],
  flags: [],
  acceptsExtraArgs: true,
  handler: async ({ sdk, project, extraArgs = [] }) => {
    // Get the words passed after --
    const words = extraArgs

    // Get all commands for completion context
    const commands = await getCommands()

    // Get completions
    const completions = await zshCompletionsFor(words, {
      sdk,
      project,
      commands,
    })

    // Output completions for zsh (one per line)
    // Escape colons as they are used as delimiters in zsh completions
    for (const completion of completions) {
      console.log(completion.replace(/:/g, '\\:'))
    }

    return { success: true }
  },
})
