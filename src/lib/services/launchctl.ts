import { exec } from 'node:child_process'
import { promisify } from 'node:util'

const execAsync = promisify(exec)

/**
 * Parsed output from launchctl print command.
 */
export interface LaunchctlPrintOutput {
  pid?: number
  status: string
  label: string
  state: string
  lastExitCode?: number
}

/**
 * Item from launchctl list command.
 */
export interface LaunchctlListItem {
  pid: number | '-'
  status: number
  label: string
}

/**
 * Get the user domain for launchctl commands.
 *
 * @returns Domain string in format "gui/USER_ID"
 */
export function getUserDomain(): string {
  const userId = process.getuid?.() ?? 501 // Default to 501 if getuid is not available
  return `gui/${userId}`
}

/**
 * Bootstrap a service (load and start).
 *
 * @param plistPath - Path to the plist file
 * @returns Result with success status and output
 */
export async function bootstrap(
  plistPath: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const domain = getUserDomain()
    const { stdout, stderr } = await execAsync(
      `launchctl bootstrap ${domain} "${plistPath}"`,
    )
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
 * Bootout a service (unload and stop).
 *
 * @param label - Service label
 * @returns Result with success status and output
 */
export async function bootout(
  label: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const domain = getUserDomain()
    const { stdout, stderr } = await execAsync(
      `launchctl bootout ${domain}/${label}`,
    )
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
 * Start a service (must be already bootstrapped).
 *
 * @param label - Service label
 * @returns Result with success status and output
 */
export async function start(
  label: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(`launchctl start ${label}`)
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
 * Stop a service (keeps it bootstrapped).
 *
 * @param label - Service label
 * @returns Result with success status and output
 */
export async function stop(
  label: string,
): Promise<{ success: boolean; output: string }> {
  try {
    const { stdout, stderr } = await execAsync(`launchctl stop ${label}`)
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
 * Get service information.
 *
 * @param label - Service label
 * @returns Parsed service info or null if not found
 */
export async function print(
  label: string,
): Promise<LaunchctlPrintOutput | null> {
  try {
    const domain = getUserDomain()
    const { stdout } = await execAsync(`launchctl print ${domain}/${label}`)

    // Parse the output
    const pidMatch = stdout.match(/pid\s*=\s*(\d+)/)
    const stateMatch = stdout.match(/state\s*=\s*(\w+)/)
    const lastExitCodeMatch = stdout.match(/last exit code\s*=\s*(\d+)/)

    return {
      label,
      pid: pidMatch ? parseInt(pidMatch[1], 10) : undefined,
      state: stateMatch ? stateMatch[1] : 'unknown',
      status: stateMatch ? stateMatch[1] : 'unknown',
      lastExitCode: lastExitCodeMatch
        ? parseInt(lastExitCodeMatch[1], 10)
        : undefined,
    }
  } catch {
    return null
  }
}

/**
 * List all services matching a pattern.
 *
 * @param pattern - Optional pattern to filter services
 * @returns Array of service items
 */
export async function list(pattern?: string): Promise<LaunchctlListItem[]> {
  try {
    const { stdout } = await execAsync('launchctl list')
    const lines = stdout.trim().split('\n').slice(1) // Skip header

    const items = lines
      .map((line) => {
        const parts = line.trim().split(/\s+/)
        if (parts.length < 3) return null

        return {
          pid: parts[0] === '-' ? '-' : parseInt(parts[0], 10),
          status: parseInt(parts[1], 10),
          label: parts[2],
        } as LaunchctlListItem
      })
      .filter((item): item is LaunchctlListItem => item !== null)

    if (pattern) {
      return items.filter((item) => item.label.includes(pattern))
    }

    return items
  } catch {
    return []
  }
}

// Default export containing all functions
export default {
  bootstrap,
  bootout,
  start,
  stop,
  print,
  list,
  getUserDomain,
}
