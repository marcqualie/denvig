import * as fs from 'node:fs'
import * as os from 'node:os'
import * as path from 'node:path'

import { Command } from '../../lib/command.ts'

const completionScript = `#compdef denvig

_denvig() {
  local -a completions
  local line

  # Get completions from denvig itself
  completions=("\${(@f)$(denvig zsh __complete__ -- "\${words[@]}" 2>/dev/null)}")

  if [[ \${#completions[@]} -gt 0 && -n "\${completions[1]}" ]]; then
    _describe 'denvig' completions
  else
    _files
  fi
}

_denvig "$@"
`

export const zshCompletionsCommand = new Command({
  name: 'zsh:completions',
  description: 'Output zsh completion script',
  usage: 'zsh completions [--install]',
  example: 'denvig zsh completions --install',
  args: [],
  flags: [
    {
      name: 'install',
      description: 'Install completions to ~/.zsh/completions/_denvig',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: ({ flags }) => {
    if (flags.install) {
      const homeDir = os.homedir()
      const completionsDir = path.join(homeDir, '.zsh', 'completions')
      const completionsFile = path.join(completionsDir, '_denvig')

      // Ensure directory exists
      if (!fs.existsSync(completionsDir)) {
        fs.mkdirSync(completionsDir, { recursive: true })
      }

      fs.writeFileSync(completionsFile, completionScript)
      console.log(`Installed completions to ${completionsFile}`)
      return { success: true }
    }

    console.log(completionScript)
    return { success: true }
  },
})
