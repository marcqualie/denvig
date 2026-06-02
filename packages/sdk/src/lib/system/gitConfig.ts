import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import { runInherit } from './process.ts'

const execFileAsync = promisify(execFile)

const readGlobalGitConfig = async (key: string): Promise<string | null> => {
  try {
    const { stdout } = await execFileAsync('git', ['config', '--global', key])
    return stdout.trim() || null
  } catch {
    return null
  }
}

export type GitIdentity = {
  name: string
  email: string
}

/** Read `user.name` and `user.email` from the global git config. */
export const getGitIdentity = async (): Promise<GitIdentity | null> => {
  const [name, email] = await Promise.all([
    readGlobalGitConfig('user.name'),
    readGlobalGitConfig('user.email'),
  ])
  if (!name || !email) return null
  return { name, email }
}

/** Whether `user.name` and `user.email` are both set in global git config. */
export const isGitConfigured = async (): Promise<boolean> => {
  return (await getGitIdentity()) !== null
}

/** Set `user.name` and `user.email` in global git config. */
export const configureGit = async (
  name: string,
  email: string,
): Promise<boolean> => {
  const setName = await runInherit('git', [
    'config',
    '--global',
    'user.name',
    name,
  ])
  if (!setName) return false
  return runInherit('git', ['config', '--global', 'user.email', email])
}
