import { spawn } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

/**
 * Absolute path to the `@denvig/cli` package root. This file lives at
 * `packages/cli/src/test/utils/runTestCommand.ts`, so three levels up is the
 * package root regardless of the process working directory.
 */
const cliPackageRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../../..',
)

/** The from-source CLI entry point that tests execute. */
const cliEntry = resolve(cliPackageRoot, 'src/cli.ts')

/**
 * The workspace root, which is the `denvig` project used as the fixture for CLI
 * integration tests — its `.denvig.yml` defines the actions and services the
 * tests assert against. Commands run here unless a test overrides `cwd`.
 */
const repoRoot = resolve(cliPackageRoot, '../..')

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
  const { env = {} } = options
  // A relative `cwd` override resolves against the CLI package; when omitted,
  // default to the repo root so the command runs inside the denvig project.
  const cwd = options.cwd ? resolve(cliPackageRoot, options.cwd) : repoRoot

  // Enforce all commands start with 'denvig'
  if (!command.startsWith('denvig')) {
    throw new Error(`Command must start with 'denvig'. Received: ${command}`)
  }
  const args = command.split(/\s+/)
  args.shift()

  // Execute the Denvig CLI using Node.js
  const child = spawn(
    'node',
    ['--experimental-strip-types', cliEntry, ...args],
    {
      cwd,
      env: { ...process.env, DENVIG_CLI_VIA: 'node:test', ...env },
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
        (process.env.DENVIG_DEBUG?.indexOf('runTestCommand') || -1) >= 0
      ) {
        console.log(`$ ${command}`)
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
