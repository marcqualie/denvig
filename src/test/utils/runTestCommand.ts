type RunTestCommandOptions = {
  /**
   * Current working directory to cd to before running the command.
   */
  cwd?: string

  /**
   * Environment variables to set for the command execution.
   */
  env?: Record<string, string>
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
export const runTestCommand = async (
  command: string,
  options: RunTestCommandOptions,
): Promise<RunTestCommandResult> => {
  // TODO:
}
