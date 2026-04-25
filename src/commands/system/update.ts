import { homedir } from 'node:os'
import path from 'node:path'

import { Command } from '../../lib/command.ts'
import { gitPull, isWorkingTreeDirty } from '../../lib/git.ts'
import { confirm } from '../../lib/input.ts'
import { prettyPath } from '../../lib/path.ts'
import { isDirectory } from '../../lib/safeReadFile.ts'
import {
  brewUpdate,
  brewUpgrade,
  getBrewOutdated,
} from '../../lib/system/brew.ts'
import { runDenvig } from '../../lib/system/denvig.ts'
import { hasSkillsCli, skillsUpdateGlobal } from '../../lib/system/skills.ts'

export const systemUpdateCommand = new Command({
  name: 'system:update',
  description: 'Update the local system: dotfiles, brew packages, and skills',
  usage: 'system update',
  example: 'denvig system update',
  args: [],
  flags: [],
  handler: async () => {
    const dotfilesPath = path.join(homedir(), '.dotfiles')

    if (!(await isDirectory(dotfilesPath))) {
      console.error(
        `Error: ${prettyPath(dotfilesPath)} does not exist. Run 'denvig system bootstrap <url>' first.`,
      )
      return { success: false, message: 'Dotfiles directory missing' }
    }

    console.log(`Updating ${prettyPath(dotfilesPath)}...`)

    if (await isWorkingTreeDirty(dotfilesPath)) {
      console.warn(
        `Warning: ${prettyPath(dotfilesPath)} has uncommitted changes`,
      )
    }

    const pulled = await gitPull(dotfilesPath)
    if (!pulled) {
      return { success: false, message: 'git pull failed' }
    }

    console.log('')
    console.log(`Running denvig update in ${prettyPath(dotfilesPath)}...`)
    const updated = await runDenvig(dotfilesPath, ['run', 'update'])
    if (!updated) {
      return { success: false, message: 'Update action failed' }
    }

    console.log('')
    console.log('Updating Homebrew...')
    await brewUpdate()

    const outdated = await getBrewOutdated()
    const formulae = outdated?.formulae ?? []
    const casks = outdated?.casks ?? []
    const totalOutdated = formulae.length + casks.length

    if (totalOutdated === 0) {
      console.log('All Homebrew packages are up to date')
    } else {
      console.log(`Outdated Homebrew packages (${totalOutdated}):`)
      for (const formula of formulae) {
        const installed = formula.installed_versions?.join(', ') ?? '?'
        const latest = formula.current_version ?? '?'
        console.log(`  ${formula.name}: ${installed} → ${latest}`)
      }
      for (const cask of casks) {
        const installed = cask.installed_versions ?? '?'
        const latest = cask.current_version ?? '?'
        console.log(`  ${cask.name} (cask): ${installed} → ${latest}`)
      }

      const shouldUpgrade = await confirm('Run `brew upgrade`?')
      if (shouldUpgrade) {
        const upgraded = await brewUpgrade()
        if (!upgraded) {
          return { success: false, message: 'brew upgrade failed' }
        }
      }
    }

    if (await hasSkillsCli()) {
      console.log('')
      console.log('Updating skills...')
      const skillsOk = await skillsUpdateGlobal()
      if (!skillsOk) {
        return { success: false, message: 'skills update failed' }
      }
    }

    return { success: true, message: 'System update complete' }
  },
})
