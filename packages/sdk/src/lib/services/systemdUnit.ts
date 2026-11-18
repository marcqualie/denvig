import type { PlistOptions } from './plist.ts'

/**
 * Escape a value for a systemd setting that expands `%` specifiers.
 */
export function escapeSpecifiers(value: string): string {
  return value.replace(/%/g, '%%')
}

/**
 * Escape a value for use inside a double-quoted systemd string.
 */
export function escapeQuoted(value: string): string {
  return escapeSpecifiers(
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'),
  )
}

/**
 * Quote a single command-line argument for an `Exec*=` setting, where `$`
 * also triggers variable expansion.
 */
export function quoteExecArg(value: string): string {
  return `"${escapeQuoted(value).replace(/\$/g, '$$$$')}"`
}

/**
 * Generate a systemd user unit from the same options used for launchd plists.
 *
 * `keepAlive` maps to `Restart=always` with no start rate limit, matching
 * launchd's indefinite respawn. Services without `keepAlive` keep their
 * active state after exiting (`RemainAfterExit`) so a finished one-shot isn't
 * mistaken for an unloaded service and relaunched.
 *
 * Units are enabled to start on login (an `[Install]` section) when they run
 * at load or are kept alive, matching launchd where `KeepAlive` implies
 * `RunAtLoad`. Stopping a service disables it, so only services left running
 * come back after a reboot.
 */
export function generateSystemdUnit(options: PlistOptions): string {
  const {
    label,
    programPath,
    workingDirectory,
    environmentVariables = {},
    standardOutPath,
    keepAlive,
    runAtLoad,
  } = options

  const environment = Object.entries(environmentVariables).map(
    ([key, value]) => `Environment="${escapeQuoted(`${key}=${value}`)}"`,
  )
  const restart = keepAlive
    ? ['Restart=always', 'RestartSec=10']
    : ['Restart=no', 'RemainAfterExit=yes']
  const logPath = escapeSpecifiers(standardOutPath)

  const lines = [
    '[Unit]',
    `Description=Denvig service ${escapeSpecifiers(label)}`,
    'StartLimitIntervalSec=0',
    '',
    '[Service]',
    'Type=simple',
    `ExecStart=${quoteExecArg(programPath)}`,
    `WorkingDirectory=${escapeSpecifiers(workingDirectory)}`,
    ...environment,
    `StandardOutput=append:${logPath}`,
    `StandardError=append:${logPath}`,
    ...restart,
  ]
  if (runAtLoad || keepAlive) {
    lines.push('', '[Install]', 'WantedBy=default.target')
  }
  return `${lines.join('\n')}\n`
}
