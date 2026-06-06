import { Command } from '../lib/command.ts'

export const versionCommand = new Command({
  name: 'version',
  description: 'Show the current version of Denvig',
  usage: 'version',
  example: 'denvig version',
  args: [],
  flags: [],
  handler: ({ sdk, flags }) => {
    const version = sdk.version()
    if (flags.json) {
      console.log(JSON.stringify({ version }))
    } else {
      console.log(`v${version}`)
    }
    return { success: true }
  },
})
