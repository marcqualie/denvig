import { exec } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { basename } from 'node:path'
import { promisify } from 'node:util'

import type { LaunchctlListItem, LaunchctlPrintOutput } from './launchctl.ts'

const execAsync = promisify(exec)

type CommandResult = { success: boolean; output: string }

/**
 * Properties requested from `systemctl show` to describe a unit.
 */
const SHOW_PROPERTIES = [
  'Id',
  'LoadState',
  'ActiveState',
  'SubState',
  'MainPID',
  'ExecMainStatus',
]

/**
 * Convert a denvig service label into its systemd unit name.
 */
export function unitName(label: string): string {
  return `${label}.service`
}

/**
 * Run a `systemctl --user` command, capturing success and output.
 */
export async function run(args: string): Promise<CommandResult> {
  try {
    const { stdout, stderr } = await execAsync(`systemctl --user ${args}`)
    return { success: true, output: stdout || stderr }
  } catch (error) {
    const execError = error as { stderr?: string; message?: string }
    return {
      success: false,
      output: execError.stderr || execError.message || 'Unknown error',
    }
  }
}

/**
 * Parse `systemctl show` output into one property map per unit. Multiple
 * units are separated by a blank line.
 */
export function parseShowOutput(stdout: string): Record<string, string>[] {
  return stdout
    .split(/\n\s*\n/)
    .map((block) => {
      const props: Record<string, string> = {}
      for (const line of block.split('\n')) {
        const eq = line.indexOf('=')
        if (eq > 0) props[line.slice(0, eq)] = line.slice(eq + 1)
      }
      return props
    })
    .filter((props) => Object.keys(props).length > 0)
}

/**
 * Whether a unit counts as "bootstrapped" in launchd terms: loaded and not
 * simply sitting inactive. A failed or auto-restarting unit is still
 * bootstrapped (just not running), mirroring a crashed launchd agent.
 */
function isBootstrapped(props: Record<string, string>): boolean {
  return props.LoadState === 'loaded' && props.ActiveState !== 'inactive'
}

/**
 * Map `systemctl show` properties to the launchctl print shape.
 */
export function toPrintOutput(
  label: string,
  props: Record<string, string>,
): LaunchctlPrintOutput | null {
  if (!isBootstrapped(props)) return null
  const mainPid = parseInt(props.MainPID ?? '0', 10)
  const running = props.ActiveState === 'active' && props.SubState === 'running'
  const exitCode = parseInt(props.ExecMainStatus ?? '', 10)
  const state = running ? 'running' : props.SubState || props.ActiveState
  return {
    label,
    pid: mainPid > 0 ? mainPid : undefined,
    state,
    status: state,
    lastExitCode: Number.isNaN(exitCode) ? undefined : exitCode,
  }
}

/**
 * Load a unit and start it. Reloads the systemd manager first so a freshly
 * written unit file is picked up, and enables the unit when it declares an
 * `[Install]` target (start on boot) or disables it otherwise.
 *
 * @param unitPath - Path to the unit file in the systemd user directory
 */
export async function bootstrap(unitPath: string): Promise<CommandResult> {
  const unit = basename(unitPath)
  const reload = await run('daemon-reload')
  if (!reload.success) return reload

  const content = await readFile(unitPath, 'utf-8').catch(() => '')
  if (/^WantedBy=/m.test(content)) {
    const enabled = await run(`enable "${unit}"`)
    if (!enabled.success) return enabled
  } else {
    await run(`disable "${unit}"`)
  }

  return await run(`start "${unit}"`)
}

/**
 * Stop a unit and clear any failed state so it reads as fully unloaded.
 *
 * @param label - Service label
 */
export async function bootout(label: string): Promise<CommandResult> {
  const result = await run(`stop "${unitName(label)}"`)
  await run(`reset-failed "${unitName(label)}"`)
  return result
}

/**
 * No-op: systemd has no launchd-style override database. Whether a unit
 * starts on boot is decided by its `[Install]` section when bootstrapped.
 */
export async function enable(_label: string): Promise<CommandResult> {
  return { success: true, output: '' }
}

/**
 * Disable a unit so it no longer starts on login.
 *
 * @param label - Service label
 */
export async function disable(label: string): Promise<CommandResult> {
  return await run(`disable "${unitName(label)}"`)
}

/**
 * Start an already-installed unit.
 *
 * @param label - Service label
 */
export async function start(label: string): Promise<CommandResult> {
  return await run(`start "${unitName(label)}"`)
}

/**
 * Stop a unit, leaving it installed (and enabled) for the next boot.
 *
 * @param label - Service label
 */
export async function stop(label: string): Promise<CommandResult> {
  return await run(`stop "${unitName(label)}"`)
}

/**
 * Reload the systemd user manager after unit files are added or removed.
 */
export async function daemonReload(): Promise<CommandResult> {
  return await run('daemon-reload')
}

/**
 * Get service information, or null when the unit isn't loaded or is inactive.
 *
 * @param label - Service label
 */
export async function print(
  label: string,
): Promise<LaunchctlPrintOutput | null> {
  try {
    const { stdout } = await execAsync(
      `systemctl --user show "${unitName(label)}" --property=${SHOW_PROPERTIES.join(',')}`,
    )
    const [props] = parseShowOutput(stdout)
    return props ? toPrintOutput(label, props) : null
  } catch {
    return null
  }
}

/**
 * List bootstrapped units whose label starts with a prefix.
 *
 * @param prefix - Optional label prefix to filter services
 */
export async function list(prefix?: string): Promise<LaunchctlListItem[]> {
  try {
    const pattern = prefix ? ` "${prefix}*"` : ''
    const { stdout } = await execAsync(
      `systemctl --user list-units --all --plain --no-legend --type=service${pattern}`,
    )
    const units = stdout
      .split('\n')
      .map((line) =>
        line
          .trim()
          .split(/\s+/)
          .find((token) => token.endsWith('.service')),
      )
      .filter((unit): unit is string => !!unit)
      .filter((unit) => !prefix || unit.startsWith(prefix))
    if (units.length === 0) return []

    const { stdout: shown } = await execAsync(
      `systemctl --user show ${units.map((u) => `"${u}"`).join(' ')} --property=${SHOW_PROPERTIES.join(',')}`,
    )
    return parseShowOutput(shown)
      .filter(isBootstrapped)
      .map((props) => {
        const pid = parseInt(props.MainPID ?? '0', 10)
        const status = parseInt(props.ExecMainStatus ?? '0', 10)
        return {
          label: (props.Id ?? '').replace(/\.service$/, ''),
          pid: pid > 0 ? pid : '-',
          status: Number.isNaN(status) ? 0 : status,
        } satisfies LaunchctlListItem
      })
  } catch {
    return []
  }
}

export default {
  bootstrap,
  bootout,
  enable,
  disable,
  start,
  stop,
  print,
  list,
  daemonReload,
  run,
}
