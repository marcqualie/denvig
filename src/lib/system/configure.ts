import { confirm, prompt } from '../input.ts'
import {
  areDotfilesInstalled,
  dotfilesUrlForUsername,
  installDotfiles,
} from './dotfiles.ts'
import {
  enableFullDiskEncryption,
  isFullDiskEncryptionEnabled,
} from './fullDiskEncryption.ts'
import { configureGit, getGitIdentity } from './gitConfig.ts'
import { installHomebrew, isHomebrewInstalled } from './homebrew.ts'
import { enableSudoTouchId, isSudoTouchIdEnabled } from './sudoTouchId.ts'
import { installXcodeCli, isXcodeCliInstalled } from './xcodeCli.ts'

type Step = {
  name: string
  check: () => Promise<boolean>
  enable: () => Promise<boolean>
  enableLabel: string
}

const ENABLED_MARK = '✓'
const DISABLED_MARK = '✗'

const printStatus = (name: string, enabled: boolean) => {
  const mark = enabled ? ENABLED_MARK : DISABLED_MARK
  const label = enabled ? 'configured' : 'not configured'
  console.log(`${mark} ${name}: ${label}`)
}

/** Returns true if the step needed user interaction. */
const runStep = async (step: Step): Promise<boolean> => {
  const enabled = await step.check()
  printStatus(step.name, enabled)
  if (enabled) return false

  const shouldEnable = await confirm(`  ${step.enableLabel}`)
  if (!shouldEnable) {
    console.log('  skipped')
    return true
  }

  const ok = await step.enable()
  if (!ok) {
    console.error(`  Failed to configure ${step.name}`)
  }
  return true
}

const installDotfilesStep = async (): Promise<void> => {
  const username = await prompt('  GitHub username')
  if (!username) {
    console.log('  skipped (no username provided)')
    return
  }
  const result = await installDotfiles(dotfilesUrlForUsername(username))
  if (!result.success) {
    console.error(`  ${result.message}`)
  }
}

const configureGitStep = async (): Promise<void> => {
  const name = await prompt('  Git user.name')
  const email = await prompt('  Git user.email')
  if (!name || !email) {
    console.log('  skipped (name and email required)')
    return
  }
  const ok = await configureGit(name, email)
  if (!ok) {
    console.error('  Failed to configure git')
  }
}

const runDotfilesStep = async (): Promise<boolean> => {
  const enabled = await areDotfilesInstalled()
  printStatus('Dotfiles', enabled)
  if (enabled) return false

  const shouldInstall = await confirm(
    '  Install dotfiles from github.com/<username>/dotfiles?',
  )
  if (!shouldInstall) {
    console.log('  skipped')
    return true
  }
  await installDotfilesStep()
  return true
}

const runGitConfigStep = async (): Promise<boolean> => {
  const identity = await getGitIdentity()
  if (identity) {
    console.log(
      `${ENABLED_MARK} Git config: ${identity.name} <${identity.email}>`,
    )
    return false
  }

  printStatus('Git config', false)
  const shouldConfigure = await confirm(
    '  Configure git user.name + user.email?',
  )
  if (!shouldConfigure) {
    console.log('  skipped')
    return true
  }
  await configureGitStep()
  return true
}

const STEPS: Step[] = [
  {
    name: 'sudo Touch ID',
    check: isSudoTouchIdEnabled,
    enable: enableSudoTouchId,
    enableLabel: 'Enable sudo Touch ID?',
  },
  {
    name: 'FileVault',
    check: isFullDiskEncryptionEnabled,
    enable: enableFullDiskEncryption,
    enableLabel: 'Enable FileVault full disk encryption?',
  },
  {
    name: 'Xcode Command Line Tools',
    check: isXcodeCliInstalled,
    enable: installXcodeCli,
    enableLabel: 'Install Xcode Command Line Tools?',
  },
  {
    name: 'Homebrew',
    check: isHomebrewInstalled,
    enable: installHomebrew,
    enableLabel: 'Install Homebrew?',
  },
]

/** Walk through every system configure step interactively. */
export const runSystemConfigure = async (): Promise<void> => {
  const runners: Array<() => Promise<boolean>> = [
    ...STEPS.map((step) => () => runStep(step)),
    runDotfilesStep,
    runGitConfigStep,
  ]

  for (const [index, run] of runners.entries()) {
    const interacted = await run()
    if (interacted && index < runners.length - 1) {
      console.log('')
    }
  }
}
