import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'

import { traceCommand } from '../debug-trace.ts'

const execFileAsync = promisify(execFile)

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
  return traceCommand(
    command,
    args,
    options.cwd,
    () =>
      new Promise<number | null>((resolve) => {
        const child = spawn(command, args, {
          cwd: options.cwd,
          stdio: options.stdio ?? 'inherit',
        })
        child.on('close', (code) => resolve(code))
        child.on('error', () => resolve(null))
      }),
    (code) => code,
  ).then((code) => code === 0)
}

type ExecCommandOptions = {
  cwd?: string
  timeout?: number
  env?: NodeJS.ProcessEnv
}

/**
 * Run a command and capture its output. Rejects when the command fails.
 */
export const execCommand = (
  command: string,
  args: string[],
  options: ExecCommandOptions = {},
): Promise<{ stdout: string; stderr: string }> => {
  return traceCommand(command, args, options.cwd, () =>
    execFileAsync(command, args, options),
  )
}
