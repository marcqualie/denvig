import { homedir } from 'node:os'
import path from 'node:path'

import { Command } from '../../lib/command.ts'
import { getGitHubSlug, gitClone, parseGitHubRemoteUrl } from '../../lib/git.ts'
import { prettyPath } from '../../lib/path.ts'
import { pathExists } from '../../lib/safeReadFile.ts'
import { runDenvig } from '../../lib/system/denvig.ts'

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
    const target = path.join(homedir(), '.dotfiles')

    if (await pathExists(target)) {
      const existingSlug = await getGitHubSlug(target)
      const requestedSlug = parseGitHubRemoteUrl(url)

      if (
        existingSlug &&
        requestedSlug &&
        existingSlug.toLowerCase() === requestedSlug.toLowerCase()
      ) {
        console.warn(
          `Warning: ${prettyPath(target)} already exists for ${existingSlug}, skipping clone`,
        )
      } else {
        const existing = existingSlug ?? '(unknown remote)'
        console.error(
          `Error: ${prettyPath(target)} already exists with a different repository (${existing})`,
        )
        return { success: false, message: 'Dotfiles directory mismatch' }
      }
    } else {
      console.log(`Cloning ${url} into ${prettyPath(target)}...`)
      const cloned = await gitClone(url, target)
      if (!cloned) {
        return { success: false, message: 'Failed to clone dotfiles repo' }
      }
    }

    console.log('')
    console.log(`Running denvig setup in ${prettyPath(target)}...`)
    const ok = await runDenvig(target, ['run', 'setup'])
    if (!ok) {
      return { success: false, message: 'Setup action failed' }
    }

    return { success: true, message: 'Setup complete' }
  },
})
