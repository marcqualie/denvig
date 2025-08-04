import { Command } from '../lib/command.ts'
import { getDenvigVersion } from '../lib/version.ts'

export const versionCommand = new Command({
  name: 'version',
  description: 'Show the current version of Denvig',
  usage: 'version',
  example: 'denvig version',
  args: [],
  flags: [],
  handler: async (_project, _args, _flags, _extraArgs) => {
    console.log(`v${getDenvigVersion()}`)
    return { success: true }
  },
})
