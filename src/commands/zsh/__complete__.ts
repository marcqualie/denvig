import { Command } from '../../lib/command.ts'
import {
  formatCompletions,
  getCompletions,
} from '../../lib/completions/completions.ts'

export const zshCompleteCommand = new Command({
  name: 'zsh:__complete__',
  description: 'Dynamic completion endpoint called by zsh',
  usage: 'zsh __complete__ -- <words> <cursor>',
  example: 'zsh __complete__ -- "denvig services" "3"',
  args: [
    {
      name: 'words',
      description: 'Full command line as a single string',
      required: false,
      type: 'string',
    },
    {
      name: 'cursor',
      description: 'Cursor position (1-indexed word)',
      required: false,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ project, args }) => {
    const wordsStr = (args.words as string) || ''
    const cursorStr = (args.cursor as string) || '2'

    // Parse the words string into an array
    const words = wordsStr.split(/\s+/).filter((w) => w.length > 0)

    // Parse cursor position (1-indexed in zsh)
    const cursor = parseInt(cursorStr, 10) || 2

    const completions = await getCompletions({ words, cursor, project })
    const output = formatCompletions(completions)

    if (output) {
      console.log(output)
    }

    return { success: true }
  },
})
