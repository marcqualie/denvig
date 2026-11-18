import { readdir, unlink } from 'node:fs/promises'
import { homedir, userInfo } from 'node:os'
import { basename, resolve } from 'node:path'

import launchctl, {
  type LaunchctlListItem,
  type LaunchctlPrintOutput,
} from './launchctl.ts'
import { generatePlist, type PlistOptions } from './plist.ts'
import systemctl from './systemctl.ts'
import { generateSystemdUnit } from './systemdUnit.ts'

/**
 * The OS service manager that runs background services.
 */
export type ServiceManagerKind = 'launchd' | 'systemd'

/**
 * A service known to the OS service manager.
 */
export type ServiceListItem = LaunchctlListItem

/**
 * Runtime details of a single service.
 */
export type ServicePrintOutput = LaunchctlPrintOutput

/**
 * Everything needed to render a service's OS config file.
 */
export type ServiceDefinition = PlistOptions

type CommandResult = { success: boolean; output: string }

/**
 * Shells that understand the POSIX syntax used by the service wrapper script.
 */
const POSIX_SHELLS = new Set(['bash', 'zsh', 'sh', 'dash', 'ksh'])

/**
 * Pick the service manager for a platform: systemd on Linux, launchd elsewhere.
 */
export function getServiceManagerKind(
  platform: NodeJS.Platform = process.platform,
): ServiceManagerKind {
  return platform === 'linux' ? 'systemd' : 'launchd'
}

/**
 * Resolved through `serviceBackend.kind` so tests can switch platforms by
 * mocking a single method.
 */
const isSystemd = () => serviceBackend.kind() === 'systemd'

const controller = () => (isSystemd() ? systemctl : launchctl)

/**
 * Directory holding systemd user units, honouring `XDG_CONFIG_HOME`.
 */
function systemdUserDir(): string {
  const configHome =
    process.env.XDG_CONFIG_HOME || resolve(homedir(), '.config')
  return resolve(configHome, 'systemd', 'user')
}

/**
 * Login shell for the service wrapper on Linux. Uses the user's shell when it
 * understands POSIX syntax, falling back to bash.
 */
function linuxLoginShell(): string {
  try {
    const shell = userInfo().shell
    if (shell && POSIX_SHELLS.has(basename(shell))) return shell
  } catch {
    // Fall through to the default
  }
  return '/bin/bash'
}

/**
 * Platform-neutral interface to the OS service manager. Uses launchd on macOS
 * and systemd user units on Linux. The platform is resolved on every call, and
 * each method can be mocked in tests.
 */
export const serviceBackend = {
  /**
   * Which service manager is in use on this platform.
   */
  kind: (): ServiceManagerKind => getServiceManagerKind(),

  /**
   * Human-readable name of the generated config file type.
   */
  configLabel: (): string => (isSystemd() ? 'Unit' : 'Plist'),

  /**
   * Directory where service config files are installed.
   */
  configDir: (): string =>
    isSystemd()
      ? systemdUserDir()
      : resolve(homedir(), 'Library', 'LaunchAgents'),

  /**
   * File extension of service config files, including the dot.
   */
  configExtension: (): string => (isSystemd() ? '.service' : '.plist'),

  /**
   * Full path of the config file for a service label.
   */
  configPath: (label: string): string =>
    resolve(
      serviceBackend.configDir(),
      `${label}${serviceBackend.configExtension()}`,
    ),

  /**
   * Render the config file contents for a service.
   */
  renderConfig: (definition: ServiceDefinition): string =>
    isSystemd() ? generateSystemdUnit(definition) : generatePlist(definition),

  /**
   * Login shell the wrapper script uses to run the service command.
   */
  loginShell: (): string => (isSystemd() ? linuxLoginShell() : '/bin/zsh'),

  /**
   * Load a service from its config file and start it.
   */
  bootstrap: (configPath: string): Promise<CommandResult> =>
    controller().bootstrap(configPath),

  /**
   * Stop and unload a service.
   */
  bootout: (label: string): Promise<CommandResult> =>
    controller().bootout(label),

  /**
   * Allow the service manager to start a service.
   */
  enable: (label: string): Promise<CommandResult> => controller().enable(label),

  /**
   * Prevent the service manager from starting a service on login.
   */
  disable: (label: string): Promise<CommandResult> =>
    controller().disable(label),

  /**
   * Stop a service while keeping it installed for the next boot.
   */
  stop: (label: string): Promise<CommandResult> => controller().stop(label),

  /**
   * Runtime details for a loaded service, or null when it isn't loaded.
   */
  print: (label: string): Promise<ServicePrintOutput | null> =>
    controller().print(label),

  /**
   * Loaded services whose label starts with a prefix.
   */
  list: (prefix?: string): Promise<ServiceListItem[]> =>
    controller().list(prefix),

  /**
   * Labels of installed config files whose label starts with a prefix,
   * whether or not the service is currently loaded.
   */
  installedLabels: async (prefix: string): Promise<string[]> => {
    const extension = serviceBackend.configExtension()
    try {
      const files = await readdir(serviceBackend.configDir())
      return files
        .filter((f) => f.startsWith(prefix) && f.endsWith(extension))
        .map((f) => f.slice(0, -extension.length))
    } catch {
      return []
    }
  },

  /**
   * Remove the installed config files for the given labels. On systemd the
   * units are disabled first so no dangling boot links remain.
   */
  uninstall: async (labels: string[]): Promise<void> => {
    if (labels.length === 0) return
    if (isSystemd()) {
      await Promise.all(labels.map((label) => systemctl.disable(label)))
    }
    await Promise.all(
      labels.map((label) =>
        unlink(serviceBackend.configPath(label)).catch(() => {}),
      ),
    )
    if (isSystemd()) await systemctl.daemonReload()
  },
}

export default serviceBackend
