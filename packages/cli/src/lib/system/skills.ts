import { pathExists } from '../safeReadFile.ts'
import { runInherit } from './process.ts'

const SKILLS_BIN = '/opt/homebrew/bin/skills'

/** Whether the `skills` CLI is installed at the well-known Homebrew path. */
export const hasSkillsCli = (): Promise<boolean> => pathExists(SKILLS_BIN)

/** Run `skills update -g`. */
export const skillsUpdateGlobal = (): Promise<boolean> => {
  return runInherit(SKILLS_BIN, ['update', '-g'])
}
