import { homedir } from 'node:os'
import path from 'node:path'

import { getGitHubSlug, gitClone, parseGitHubRemoteUrl } from '../git.ts'
import { prettyPath } from '../path.ts'
import { isDirectory } from '../safeReadFile.ts'
import { runDenvig } from './denvig.ts'

export const DOTFILES_PATH = path.join(homedir(), '.dotfiles')

/** Whether the `~/.dotfiles` directory exists. */
export const areDotfilesInstalled = (): Promise<boolean> => {
  return isDirectory(DOTFILES_PATH)
}

/** Build the canonical dotfiles repo URL for a GitHub username. */
export const dotfilesUrlForUsername = (username: string): string => {
  return `https://github.com/${username}/dotfiles`
}

type InstallDotfilesResult = {
  success: boolean
  message: string
}

/**
 * Clone the dotfiles repo to `~/.dotfiles` (or skip if already present and
 * the remote matches), then run `denvig run setup` inside it.
 */
export const installDotfiles = async (
  url: string,
): Promise<InstallDotfilesResult> => {
  if (await areDotfilesInstalled()) {
    const existingSlug = await getGitHubSlug(DOTFILES_PATH)
    const requestedSlug = parseGitHubRemoteUrl(url)

    if (
      existingSlug &&
      requestedSlug &&
      existingSlug.toLowerCase() === requestedSlug.toLowerCase()
    ) {
      console.warn(
        `Warning: ${prettyPath(DOTFILES_PATH)} already exists for ${existingSlug}, skipping clone`,
      )
    } else {
      const existing = existingSlug ?? '(unknown remote)'
      return {
        success: false,
        message: `${prettyPath(DOTFILES_PATH)} already exists with a different repository (${existing})`,
      }
    }
  } else {
    console.log(`Cloning ${url} into ${prettyPath(DOTFILES_PATH)}...`)
    const cloned = await gitClone(url, DOTFILES_PATH)
    if (!cloned) {
      return { success: false, message: 'Failed to clone dotfiles repo' }
    }
  }

  console.log('')
  console.log(`Running denvig setup in ${prettyPath(DOTFILES_PATH)}...`)
  const ok = await runDenvig(DOTFILES_PATH, ['run', 'setup'])
  if (!ok) {
    return { success: false, message: 'Setup action failed' }
  }

  return { success: true, message: 'Dotfiles installed' }
}
