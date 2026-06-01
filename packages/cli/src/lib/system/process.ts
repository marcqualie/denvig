import { spawn } from 'node:child_process'

type RunInheritOptions = {
  cwd?: string
  stdio?: 'inherit' | 'ignore'
}

/**
 * Spawn a child process with inherited (or ignored) stdio.
 * Resolves to whether the command exited successfully.
 */
export const runInherit = (
  command: string,
  args: string[],
  options: RunInheritOptions = {},
): Promise<boolean> => {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: options.stdio ?? 'inherit',
    })
    child.on('close', (code) => resolve(code === 0))
    child.on('error', () => resolve(false))
  })
}
