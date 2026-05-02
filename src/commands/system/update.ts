import { homedir } from 'node:os'
import path from 'node:path'

import { Command } from '../../lib/command.ts'
import { COLORS } from '../../lib/formatters/table.ts'
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

type StepResult = {
  name: string
  success: boolean
  message?: string
}

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

    const results: StepResult[] = []

    const runStep = async (
      name: string,
      fn: () => Promise<{ success: boolean; message?: string }>,
    ): Promise<boolean> => {
      console.log('')
      console.log(`${COLORS.bold}==> ${name}${COLORS.reset}`)
      try {
        const result = await fn()
        results.push({ name, ...result })
        return result.success
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e)
        console.error(`Error: ${message}`)
        results.push({ name, success: false, message })
        return false
      }
    }

    await runStep(`Pull dotfiles (${prettyPath(dotfilesPath)})`, async () => {
      if (await isWorkingTreeDirty(dotfilesPath)) {
        console.warn(
          `Warning: ${prettyPath(dotfilesPath)} has uncommitted changes`,
        )
      }
      const ok = await gitPull(dotfilesPath)
      return ok
        ? { success: true }
        : { success: false, message: 'git pull failed' }
    })

    await runStep('Run dotfiles update action', async () => {
      const ok = await runDenvig(dotfilesPath, ['run', 'update'])
      return ok
        ? { success: true }
        : { success: false, message: 'denvig run update failed' }
    })

    await runStep('Update Homebrew', async () => {
      const ok = await brewUpdate()
      return ok
        ? { success: true }
        : { success: false, message: 'brew update failed' }
    })

    const outdated = await getBrewOutdated()
    const formulae = outdated?.formulae ?? []
    const casks = outdated?.casks ?? []
    const totalOutdated = formulae.length + casks.length

    console.log('')
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
        await runStep('Upgrade Homebrew packages', async () => {
          const ok = await brewUpgrade()
          return ok
            ? { success: true }
            : { success: false, message: 'brew upgrade failed' }
        })
      }
    }

    if (await hasSkillsCli()) {
      await runStep('Update skills', async () => {
        const ok = await skillsUpdateGlobal()
        return ok
          ? { success: true }
          : { success: false, message: 'skills update failed' }
      })
    }

    const failed = results.filter((r) => !r.success)

    console.log('')
    console.log(`${COLORS.bold}Summary${COLORS.reset}`)
    for (const r of results) {
      const icon = r.success
        ? `${COLORS.green}✓${COLORS.reset}`
        : `${COLORS.red}✗${COLORS.reset}`
      console.log(`${icon} ${r.name}`)
    }

    if (failed.length > 0) {
      return {
        success: false,
        message: `${failed.length} of ${results.length} steps failed`,
      }
    }
    return { success: true, message: 'System update complete' }
  },
})
