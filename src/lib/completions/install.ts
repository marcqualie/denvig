import { execSync } from 'node:child_process'
import {
  accessSync,
  constants,
  existsSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import * as readline from 'node:readline'

import { zshCompletionScript } from './script.ts'

export const USER_COMPLETIONS_DIR = resolve(homedir(), '.zsh', 'completions')

export type InstallLocation = {
  path: string
  label: string
  inFpath: boolean
  writable: boolean
}

/**
 * Get the user's current fpath directories by invoking zsh.
 */
export function getFpath(): string[] {
  try {
    const output = execSync("zsh -c 'echo $fpath'", {
      encoding: 'utf-8',
    }).trim()
    return output.split(/\s+/).filter((dir) => dir.length > 0)
  } catch {
    return []
  }
}

/**
 * Check if a directory is in the fpath.
 */
export function isInFpath(dir: string, fpathDirs: string[]): boolean {
  const resolvedDir = resolve(dir)
  return fpathDirs.some((fpathDir) => {
    const resolved = fpathDir.startsWith('~')
      ? resolve(homedir(), fpathDir.slice(2))
      : resolve(fpathDir)
    return resolved === resolvedDir
  })
}

/**
 * Check if a directory is writable.
 */
export function isWritable(dir: string): boolean {
  try {
    if (!existsSync(dir)) {
      const parent = resolve(dir, '..')
      accessSync(parent, constants.W_OK)
      return true
    }
    accessSync(dir, constants.W_OK)
    return true
  } catch {
    return false
  }
}

/**
 * Get available install locations with their status.
 */
export function getInstallLocations(): InstallLocation[] {
  const fpathDirs = getFpath()

  const locations: InstallLocation[] = [
    {
      path: USER_COMPLETIONS_DIR,
      label: '~/.zsh/completions',
      inFpath: isInFpath(USER_COMPLETIONS_DIR, fpathDirs),
      writable: isWritable(USER_COMPLETIONS_DIR),
    },
  ]

  for (const fpathDir of fpathDirs) {
    const resolvedDir = fpathDir.startsWith('~')
      ? resolve(homedir(), fpathDir.slice(2))
      : resolve(fpathDir)

    if (resolvedDir === USER_COMPLETIONS_DIR) continue

    locations.push({
      path: resolvedDir,
      label: fpathDir,
      inFpath: true,
      writable: isWritable(resolvedDir),
    })
  }

  return locations
}

/**
 * Prompt user to select an install location.
 */
export async function promptForLocation(
  locations: InstallLocation[],
): Promise<InstallLocation | null> {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stderr,
  })

  console.error('Select install location:')
  console.error('')

  const yellow = '\x1b[33m'
  const reset = '\x1b[0m'

  locations.forEach((loc, index) => {
    const tags: string[] = []
    if (!loc.inFpath) {
      tags.push(`${yellow}not in fpath${reset}`)
    }
    if (!loc.writable) {
      tags.push('not writable')
    }
    const status = tags.length > 0 ? `(${tags.join(', ')})` : ''
    console.error(`  ${index + 1}) ${loc.label} ${status}`)
  })

  console.error('')

  return new Promise((resolvePromise) => {
    rl.question('Enter number [1]: ', (answer) => {
      rl.close()

      const choice = answer.trim() === '' ? 1 : parseInt(answer, 10)
      if (Number.isNaN(choice) || choice < 1 || choice > locations.length) {
        console.error('Invalid selection.')
        resolvePromise(null)
        return
      }

      const selected = locations[choice - 1]
      if (!selected.writable) {
        console.error(`Error: ${selected.label} is not writable.`)
        resolvePromise(null)
        return
      }

      resolvePromise(selected)
    })
  })
}

/**
 * Install the completion script to a directory.
 */
export function installTo(location: InstallLocation): boolean {
  const targetFile = resolve(location.path, '_denvig')

  if (!existsSync(location.path)) {
    mkdirSync(location.path, { recursive: true })
  }

  writeFileSync(targetFile, zshCompletionScript, 'utf-8')

  console.log(`Installed completion script to ${targetFile}`)
  console.log('')

  if (!location.inFpath) {
    console.log('To enable completions, add the following to your ~/.zshrc')
    console.log('(before any existing compinit line):')
    console.log('')
    console.log(`  fpath=(${location.label} $fpath)`)
    console.log('  autoload -Uz compinit && compinit')
    console.log('')
    console.log('Then restart your shell or run: source ~/.zshrc')
  } else {
    console.log('To enable completions, run:')
    console.log('')
    console.log('  rm -f ~/.zcompdump && compinit')
    console.log('')
    console.log('Or restart your shell.')
  }

  return true
}

/**
 * Check if running in interactive mode (TTY).
 */
export function isInteractive(): boolean {
  return process.stdin.isTTY === true
}

/**
 * Print a warning if ~/.zsh/completions is not in fpath.
 */
export function printFpathWarning(): void {
  const fpathDirs = getFpath()
  if (!isInFpath(USER_COMPLETIONS_DIR, fpathDirs)) {
    console.warn('Warning: ~/.zsh/completions is not in your fpath.')
    console.warn('')
    console.warn('Add this line to your ~/.zshrc (before compinit):')
    console.warn('')
    console.warn('  fpath=(~/.zsh/completions $fpath)')
    console.warn('')
  }
}
