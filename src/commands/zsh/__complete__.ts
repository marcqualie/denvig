import * as fs from 'node:fs'
import * as path from 'node:path'

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

    // Log to debug file
    const logDir = path.join(process.cwd(), 'logs')
    const logFile = path.join(logDir, 'zsh-completions-debug.txt')

    // Ensure logs directory exists
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true })
    }

    // Append debug info
    const timestamp = new Date().toISOString()
    const debugLine = `[${timestamp}] words: ${JSON.stringify(words)} -> completions: ${JSON.stringify(completions)}\n`
    fs.appendFileSync(logFile, debugLine)

    // Output completions for zsh (one per line)
    // Escape colons as they are used as delimiters in zsh completions
    for (const completion of completions) {
      console.log(completion.replace(/:/g, '\\:'))
    }

    return { success: true }
  },
})
