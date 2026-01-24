import { Command } from '../lib/command.ts'
import { getDenvigVersion } from '../lib/version.ts'

export const versionCommand = new Command({
  name: 'version',
  description: 'Show the current version of Denvig',
  usage: 'version',
  example: 'denvig version',
  args: [],
  flags: [],
  handler: ({ flags }) => {
    const version = getDenvigVersion()
    if (flags.json) {
      console.log(JSON.stringify({ version }))
    } else {
      console.log(`v${version}`)
    }
    return { success: true }
  },
})
