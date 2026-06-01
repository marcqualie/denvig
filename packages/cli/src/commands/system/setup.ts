import { Command } from '../../lib/command.ts'
import { installDotfiles } from '../../lib/system/dotfiles.ts'

export const systemSetupCommand = new Command({
  name: 'system:setup',
  description: 'Clone a dotfiles repository to ~/.dotfiles and run setup',
  usage: 'system setup <url>',
  example: 'denvig system setup https://github.com/marcqualie/dotfiles',
  args: [
    {
      name: 'url',
      description: 'Git URL of the dotfiles repository',
      required: true,
      type: 'string',
    },
  ],
  flags: [],
  handler: async ({ args }) => {
    const url = String(args.url)
    const result = await installDotfiles(url)
    if (!result.success) {
      console.error(`Error: ${result.message}`)
    }
    return result
  },
})
