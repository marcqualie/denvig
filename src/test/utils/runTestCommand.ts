import { spawn } from 'node:child_process'
import process from 'node:process'

type RunTestCommandOptions = {
  /**
   * Current working directory to cd to before running the command.
   */
  cwd?: string

  /**
   * Environment variables to set for the command execution.
   */
  env?: Record<string, string>

  /**
   * Enabling will print result to console for debugging purposes.
   */
  debug?: boolean
}

type RunTestCommandResult = {
  /**
   * Status code from the command execution.
   */
  code: number

  /**
   * Standard output from the command execution.
   */
  stdout: string

  /**
   * Error output from the command execution.
   */
  stderr: string
}

/**
 * Execute the denvig CLI command that is passed in.
 * Designed for use within the test suite to verify commands are parsed
 * correctly the results are returned in the correct format.
 *
 * @example
 * ```ts
 * const result = await runTestCommand('denvig version')
 *```
 * @example
 * ```ts
 * const { stdout, stderr, code } = await runTestCommand('denvig run outdated', {
 *   cwd: '/path/to/project',
 *   env: { NODE_ENV: 'test' },
 * })
 * ```
 */
export const runTestCommand = (
  command: string,
  options: RunTestCommandOptions = {},
): Promise<RunTestCommandResult> => {
  const { cwd = process.cwd(), env = {} } = options
  const rootDir = process.cwd()

  // Enforce all commands start with 'denvig'
  if (!command.startsWith('denvig')) {
    throw new Error(`Command must start with 'denvig'. Received: ${command}`)
  }
  const args = command.split(/\s+/)
  args.shift()

  // Execute the Denvig CLI using Deno
  const child = spawn(
    'deno',
    [
      'run',
      '--allow-env',
      '--allow-read',
      '--allow-run',
      `${rootDir}/src/cli.ts`,
      ...args,
    ],
    {
      cwd,
      env: { ...process.env, ...env },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  )

  let stdout = ''
  let stderr = ''

  // Capture stdout
  child.stdout?.on('data', (data: Uint8Array) => {
    stdout += new TextDecoder().decode(data)
  })

  // Capture stderr
  child.stderr?.on('data', (data: Uint8Array) => {
    stderr += new TextDecoder().decode(data)
  })

  // Wait for the process to complete
  return new Promise((resolve) => {
    child.on('close', (code: number | null) => {
      if (
        options.debug ||
        (Deno.env.get('DENVIG_DEBUG')?.indexOf('runTestCommand') || -1) >= 0
      ) {
        console.log('$ denvig run hello')
        console.log(`|- code: ${code || 0}`)
        console.log('|- stdout:')
        stdout
          .trim()
          .split('\n')
          .map((line) => console.log(`|    ${line}`))
        console.log('|- stderr:')
        stderr
          .trim()
          .split('\n')
          .map((line) => console.log(`|    ${line}`))
      }
      resolve({
        code: code ?? 0,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      })
    })
  })
}
