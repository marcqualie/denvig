import { Command } from '../../lib/command.ts'
import {
  getInstallLocations,
  installTo,
  isInteractive,
  printFpathWarning,
  promptForLocation,
} from '../../lib/completions/install.ts'
import { zshCompletionScript } from '../../lib/completions/script.ts'

export const zshCompletionsCommand = new Command({
  name: 'zsh:completions',
  description: 'Output or install the zsh completion script',
  usage: 'zsh completions [--install]',
  example: 'zsh completions --install',
  args: [],
  flags: [
    {
      name: 'install',
      description: 'Install the completion script',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ flags }) => {
    const install = flags.install as boolean

    if (!install) {
      printFpathWarning()
      console.log(zshCompletionScript)
      return { success: true }
    }

    const locations = getInstallLocations()

    if (isInteractive()) {
      const selected = await promptForLocation(locations)
      if (!selected) {
        return { success: false }
      }
      const success = installTo(selected)
      return { success }
    }

    const defaultLocation = locations[0]
    if (!defaultLocation.inFpath) {
      console.warn('Warning: ~/.zsh/completions is not in your fpath.')
      console.warn('')
    }
    const success = installTo(defaultLocation)
    return { success }
  },
})
