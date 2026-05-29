import { mkdir, writeFile } from 'node:fs/promises'
import * as os from 'node:os'
import * as path from 'node:path'

import { Command } from '../../lib/command.ts'
import { pathExists } from '../../lib/safeReadFile.ts'

const SUPPORTED_SHELLS = ['zsh'] as const
type SupportedShell = (typeof SUPPORTED_SHELLS)[number]

const zshCompletionScript = `#compdef denvig

_denvig() {
  local -a completions
  local line

  # Get completions from denvig itself
  completions=("\${(@f)$(denvig shell __complete__ -- "\${words[@]}" 2>/dev/null)}")

  if [[ \${#completions[@]} -gt 0 && -n "\${completions[1]}" ]]; then
    _describe 'denvig' completions
  else
    _files
  fi
}

_denvig "$@"
`

const installZshCompletions = async (): Promise<string> => {
  const completionsDir = path.join(os.homedir(), '.zsh', 'completions')
  const completionsFile = path.join(completionsDir, '_denvig')

  if (!(await pathExists(completionsDir))) {
    await mkdir(completionsDir, { recursive: true })
  }

  await writeFile(completionsFile, zshCompletionScript)
  return completionsFile
}

export const shellCompletionsCommand = new Command({
  name: 'shell:completions',
  description: 'Output a shell completion script',
  usage: 'shell completions <shell> [--install]',
  example: 'denvig shell completions zsh --install',
  args: [
    {
      name: 'shell',
      description: `Shell to generate completions for (${SUPPORTED_SHELLS.join(', ')})`,
      required: true,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'install',
      description: 'Install completions to the shell completions directory',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ args, flags }) => {
    const shell = String(args.shell)

    if (!SUPPORTED_SHELLS.includes(shell as SupportedShell)) {
      const message = `Unsupported shell for completions: ${shell}. Supported shells: ${SUPPORTED_SHELLS.join(', ')}`
      console.error(message)
      return { success: false, message }
    }

    if (flags.install) {
      const completionsFile = await installZshCompletions()
      console.log(`Installed completions to ${completionsFile}`)
      return { success: true }
    }

    console.log(zshCompletionScript)
    return { success: true }
  },
})
