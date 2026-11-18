import { exec } from 'node:child_process'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import serviceBackend from '../services/backend.ts'
import { isPortInUse } from '../services/ports.ts'
import systemctl from '../services/systemctl.ts'
import { escapeSpecifiers, quoteExecArg } from '../services/systemdUnit.ts'

const execAsync = promisify(exec)

/**
 * Label of the systemd user unit that runs the user-owned gateway nginx.
 * Deliberately outside the `denvig.` prefix so the service reconciler never
 * treats it as an unclaimed project service.
 */
export const GATEWAY_UNIT_LABEL = 'denvig-gateway'

/**
 * Default nginx configs path on macOS, where Homebrew's nginx is user-owned.
 */
export const HOMEBREW_GATEWAY_CONFIGS_PATH = '/opt/homebrew/etc/nginx/servers'

/**
 * Locations checked for `mime.types` when running a user-owned nginx.
 */
const MIME_TYPES_PATHS = [
  '/etc/nginx/mime.types',
  '/usr/local/etc/nginx/mime.types',
  '/opt/homebrew/etc/nginx/mime.types',
]

/**
 * Root directory of the user-owned nginx (prefix, config, logs, temp files).
 */
export function getUserNginxDir(): string {
  return resolve(homedir(), '.denvig', 'nginx')
}

/**
 * Default gateway configs path for the current platform. Linux has no
 * user-writable nginx install, so denvig runs its own under `~/.denvig/nginx`.
 */
export function getDefaultGatewayConfigsPath(): string {
  return serviceBackend.kind() === 'systemd'
    ? resolve(getUserNginxDir(), 'servers')
    : HOMEBREW_GATEWAY_CONFIGS_PATH
}

/**
 * Whether the gateway uses denvig's own nginx (run as a systemd user unit)
 * rather than a separately managed install such as Homebrew's.
 */
export function isUserOwnedNginx(configsPath: string): boolean {
  return (
    serviceBackend.kind() === 'systemd' &&
    resolve(configsPath, '..') === getUserNginxDir()
  )
}

/**
 * First `mime.types` file found from a shared nginx install, if any.
 */
export async function findMimeTypesPath(
  candidates: string[] = MIME_TYPES_PATHS,
): Promise<string | null> {
  for (const candidate of candidates) {
    try {
      await access(candidate)
      return candidate
    } catch {
      // Try the next location
    }
  }
  return null
}

/**
 * Directories the user-owned nginx writes to at runtime.
 */
export function getUserNginxRuntimeDirs(dir: string): string[] {
  return [
    resolve(dir, 'logs'),
    resolve(dir, 'servers'),
    ...['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi'].map((name) =>
      resolve(dir, 'temp', name),
    ),
  ]
}

/**
 * Arguments that point nginx at the user-owned prefix and config.
 */
function nginxArgs(nginxPath: string, dir: string): string[] {
  return [
    nginxPath,
    '-e',
    'stderr',
    '-p',
    dir,
    '-c',
    resolve(dir, 'nginx.conf'),
  ]
}

/**
 * Generate the systemd user unit that runs the gateway nginx in the
 * foreground. It is enabled to start on login so domains keep resolving
 * after a reboot.
 */
export function generateGatewayUnit(nginxPath: string, dir: string): string {
  const exec = (extra: string[]) =>
    [...nginxArgs(nginxPath, dir), ...extra].map(quoteExecArg).join(' ')
  return `[Unit]
Description=Denvig gateway (nginx)
StartLimitIntervalSec=0

[Service]
Type=simple
WorkingDirectory=${escapeSpecifiers(dir)}
ExecStartPre=${exec(['-t', '-q'])}
ExecStart=${exec(['-g', 'daemon off;'])}
ExecReload=/bin/kill -HUP $MAINPID
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
`
}

/**
 * Ports the gateway nginx listens on.
 */
const GATEWAY_PORTS = [80, 443]

/**
 * How long nginx keeps retrying a failed bind before exiting (5 attempts
 * 500ms apart), plus some margin. A start is only trusted after this.
 */
const BIND_SETTLE_MS = 3500

/**
 * Explain why nginx can't bind the gateway ports, when the cause is known.
 */
async function portSetupHint(): Promise<string | null> {
  const hints: string[] = []
  try {
    const start = parseInt(
      await readFile('/proc/sys/net/ipv4/ip_unprivileged_port_start', 'utf-8'),
      10,
    )
    if (start > 80) {
      hints.push(
        "Allow binding ports 80/443 without root (one-time): echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/50-denvig.conf && sudo sysctl --system",
      )
    }
  } catch {
    // Not available on this kernel
  }
  try {
    await execAsync('systemctl is-active --quiet nginx.service')
    hints.push(
      'The system nginx service already owns ports 80/443; disable it with: sudo systemctl disable --now nginx',
    )
  } catch {
    // System nginx isn't running
  }
  if (hints.length === 0) {
    const busy: number[] = []
    for (const port of GATEWAY_PORTS) {
      if (await isPortInUse(port)) busy.push(port)
    }
    if (busy.length > 0) {
      hints.push(
        `Port ${busy.join(' and ')} ${busy.length === 1 ? 'is' : 'are'} already in use by another process`,
      )
    }
  }
  return hints.length > 0 ? hints.join('\n') : null
}

/**
 * Last lines of the user-owned nginx error output for a failed start.
 */
async function recentGatewayErrors(): Promise<string> {
  try {
    const { stdout } = await execAsync(
      `journalctl --user -u ${GATEWAY_UNIT_LABEL}.service -n 5 --no-pager -o cat`,
    )
    return stdout.trim()
  } catch {
    return ''
  }
}

/**
 * Install (if needed) and start or reload the user-owned gateway nginx.
 *
 * @param nginxPath - Resolved nginx binary
 */
export async function reloadUserNginx(
  nginxPath: string,
): Promise<{ success: boolean; message?: string }> {
  const dir = getUserNginxDir()
  await Promise.all(
    getUserNginxRuntimeDirs(dir).map((d) => mkdir(d, { recursive: true })),
  )

  const unitPath = serviceBackend.configPath(GATEWAY_UNIT_LABEL)
  const unit = generateGatewayUnit(nginxPath, dir)
  const existing = await readFile(unitPath, 'utf-8').catch(() => null)
  if (existing !== unit) {
    await mkdir(resolve(unitPath, '..'), { recursive: true })
    await writeFile(unitPath, unit, 'utf-8')
    await systemctl.daemonReload()
  }

  try {
    await execAsync(
      [...nginxArgs(nginxPath, dir), '-t', '-q']
        .map((arg) => `'${arg.replace(/'/g, "'\\''")}'`)
        .join(' '),
    )
  } catch (error) {
    const execError = error as { stderr?: string; message?: string }
    return {
      success: false,
      message: `Invalid nginx config: ${(execError.stderr || execError.message || '').trim()}`,
    }
  }

  const unitName = `${GATEWAY_UNIT_LABEL}.service`
  const running =
    (await systemctl.print(GATEWAY_UNIT_LABEL))?.state === 'running'
  if (!running) {
    // Ports held by another process (eg. the distro nginx) would only send
    // the unit into a restart loop, so report the conflict up front.
    const hint = await portSetupHint()
    if (hint) {
      await systemctl.run(`stop ${unitName}`)
      return { success: false, message: `Gateway nginx can't start:\n${hint}` }
    }
  }
  const result = running
    ? await systemctl.run(`reload ${unitName}`)
    : await systemctl.run(`enable --now ${unitName}`)
  if (!result.success) {
    return { success: false, message: result.output.trim() }
  }
  if (running) return { success: true }

  // A fresh start forks immediately and nginx retries a failed bind for a
  // few seconds before exiting, so only trust the start once that has passed.
  await new Promise((r) => setTimeout(r, BIND_SETTLE_MS))
  if ((await systemctl.print(GATEWAY_UNIT_LABEL))?.state === 'running') {
    return { success: true }
  }
  // Stop the restart loop so it doesn't keep failing in the background; the
  // next gateway configure retries once the ports are available.
  await systemctl.run(`stop ${unitName}`)
  const details = [await recentGatewayErrors(), await portSetupHint()]
    .filter(Boolean)
    .join('\n')
  return {
    success: false,
    message: `Gateway nginx failed to start${details ? `:\n${details}` : ''}`,
  }
}
