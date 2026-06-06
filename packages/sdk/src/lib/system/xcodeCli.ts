import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { runInherit } from './process.ts'

const execFileAsync = promisify(execFile)

/** Whether the Xcode Command Line Tools are installed. */
export const isXcodeCliInstalled = async (): Promise<boolean> => {
  try {
    await execFileAsync('xcode-select', ['-p'])
    return true
  } catch {
    return false
  }
}

/**
 * Trigger the Xcode Command Line Tools installer.
 * This pops up a system dialog; installation continues asynchronously.
 */
export const installXcodeCli = (): Promise<boolean> => {
  return runInherit('xcode-select', ['--install'])
}
