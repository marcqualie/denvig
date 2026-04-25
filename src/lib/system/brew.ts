import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { runInherit } from './process.ts'

const execFileAsync = promisify(execFile)

export type BrewOutdatedFormula = {
  name: string
  installed_versions?: string[]
  current_version?: string
}

export type BrewOutdatedCask = {
  name: string
  installed_versions?: string
  current_version?: string
}

export type BrewOutdatedJson = {
  formulae?: BrewOutdatedFormula[]
  casks?: BrewOutdatedCask[]
}

/** Run `brew update` silently. Resolves to exit success. */
export const brewUpdate = (): Promise<boolean> => {
  return runInherit('brew', ['update'], { stdio: 'ignore' })
}

/** Run `brew upgrade` with inherited stdio. */
export const brewUpgrade = (): Promise<boolean> => {
  return runInherit('brew', ['upgrade'])
}

/** Read outdated brew packages as parsed JSON, or null if the call fails. */
export const getBrewOutdated = async (): Promise<BrewOutdatedJson | null> => {
  try {
    const { stdout } = await execFileAsync('brew', ['outdated', '--json=v2'])
    return JSON.parse(stdout) as BrewOutdatedJson
  } catch {
    return null
  }
}
