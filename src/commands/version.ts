import { Command } from '../lib/command.ts'
import { getDenvigVersion } from '../lib/version.ts'

export const versionCommand = new Command({
  name: 'version',
  description: 'Show the current version of Denvig',
  usage: 'version',
  example: 'denvig version',
  args: [],
  flags: [],
  handler: () => {
    console.log(`v${getDenvigVersion()}`)
    return { success: true }
  },
})
