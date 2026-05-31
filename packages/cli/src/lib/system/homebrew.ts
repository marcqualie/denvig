import { pathExists } from '../safeReadFile.ts'
import { runInherit } from './process.ts'

const HOMEBREW_BIN = '/opt/homebrew/bin/brew'
const INSTALL_URL =
  'https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh'

/** Whether Homebrew is installed at the standard Apple Silicon path. */
export const isHomebrewInstalled = (): Promise<boolean> => {
  return pathExists(HOMEBREW_BIN)
}

/** Run the official Homebrew install script. */
export const installHomebrew = (): Promise<boolean> => {
  const cmd = `/bin/bash -c "$(curl -fsSL ${INSTALL_URL})"`
  return runInherit('sh', ['-c', cmd])
}
