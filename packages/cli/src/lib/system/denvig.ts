import { spawn } from 'node:child_process'

/**
 * Spawn a child denvig process in the given directory and inherit stdio.
 * Resolves to whether the command exited successfully.
 */
export const runDenvig = (cwd: string, args: string[]): Promise<boolean> => {
  return new Promise((resolve) => {
    const child = spawn('denvig', args, { cwd, stdio: 'inherit' })
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}
