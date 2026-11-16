import type { PlistOptions } from './plist.ts'

/**
 * Escape a value for a systemd setting that expands `%` specifiers.
 */
function escapeSpecifiers(value: string): string {
  return value.replace(/%/g, '%%')
}

/**
 * Escape a value for use inside a double-quoted systemd string.
 */
function escapeQuoted(value: string): string {
  return escapeSpecifiers(
    value.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n'),
  )
}

/**
 * Generate a systemd user unit from the same options used for launchd plists.
 *
 * `keepAlive` maps to `Restart=always` with no start rate limit, matching
 * launchd's indefinite respawn. Services without `keepAlive` keep their
 * active state after exiting (`RemainAfterExit`) so a finished one-shot isn't
 * mistaken for an unloaded service and relaunched. `runAtLoad` adds an
 * `[Install]` section so the unit is enabled to start on login.
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
    `ExecStart="${escapeQuoted(programPath).replace(/\$/g, '$$$$')}"`,
    `WorkingDirectory=${escapeSpecifiers(workingDirectory)}`,
    ...environment,
    `StandardOutput=append:${logPath}`,
    `StandardError=append:${logPath}`,
    ...restart,
  ]
  if (runAtLoad) {
    lines.push('', '[Install]', 'WantedBy=default.target')
  }
  return `${lines.join('\n')}\n`
}
