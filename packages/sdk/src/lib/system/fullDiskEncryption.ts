import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { runInherit } from './process.ts'

const execFileAsync = promisify(execFile)

/** Whether macOS FileVault is currently turned on. */
export const isFullDiskEncryptionEnabled = async (): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync('fdesetup', ['status'])
    return /FileVault is On/i.test(stdout)
  } catch {
    return false
  }
}

/** Run `sudo fdesetup enable` interactively. */
export const enableFullDiskEncryption = (): Promise<boolean> => {
  return runInherit('sudo', ['fdesetup', 'enable'])
}
