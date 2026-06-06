import { spawn } from 'node:child_process'

export type RunActionOptions = {
  /** Extra arguments appended to every command. */
  args?: string[]
  /** Worktree slug, exported to the spawned process as `DENVIG_PROJECT`. */
  projectSlug: string
  /** Working directory the commands run in. */
  cwd: string
  /**
   * Force interactive (TTY-preserving) execution. Defaults to whether the
   * parent process has a TTY on both stdin and stdout.
   */
  interactive?: boolean
  /** Sink for the `$ <command>` echo lines. Defaults to `console.log`. */
  onCommand?: (line: string) => void
}

export type RunActionResult = { success: boolean }

/**
 * Run a sequence of shell commands, streaming their stdio to the parent
 * process. TTY-aware: wraps each command in `script` when interactive so colour
 * and prompts are preserved, falling back to `sh -c` otherwise. Commands run
 * sequentially; the first failure marks the run failed but the remaining
 * commands still run.
 */
export const runActionCommands = async (
  commands: string[],
  options: RunActionOptions,
): Promise<RunActionResult> => {
  const { args = [], projectSlug, cwd } = options
  const onCommand = options.onCommand ?? ((line: string) => console.log(line))
  const interactive =
    options.interactive ?? !!(process.stdout.isTTY && process.stdin.isTTY)

  let status: RunActionResult = { success: true }

  for (const command of commands) {
    const commandToProxy = `${command} ${args.join(' ')}`.trim()
    onCommand(`$ ${commandToProxy}`)

    const env = {
      ...process.env,
      DENVIG_PROJECT: projectSlug,
    }

    let commandName: string
    let commandArgs: string[]

    if (interactive) {
      // Use `script` to preserve TTY behaviour in interactive environments.
      if (process.platform === 'darwin') {
        // macOS (BSD script): script [options] [file [command]]
        commandName = 'script'
        commandArgs = ['-q', '/dev/null', 'sh', '-c', commandToProxy]
      } else {
        // Linux (util-linux script): script [options] [file]
        commandName = 'script'
        commandArgs = ['-q', '-c', commandToProxy, '/dev/null']
      }
    } else {
      // Direct execution in non-TTY environments (tests, CI, pipes).
      commandName = 'sh'
      commandArgs = ['-c', commandToProxy]
    }

    const child = spawn(commandName, commandArgs, {
      cwd,
      env,
      stdio: 'inherit',
    })

    const commandStatus = await new Promise<RunActionResult>((resolve) => {
      child.on('close', (code: number | null) => {
        resolve({ success: code === 0 })
      })
    })
    if (!commandStatus.success) {
      status = commandStatus
    }
  }

  return status
}
