import { appendFile, mkdir } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

/**
 * CLI usage log entry structure.
 */
export type CliLogEntry = {
  timestamp: string
  version: string
  command: string
  path: string
  duration: number
  status: number
  slug?: string
  via?: string
  error?: string
}

/**
 * Check if CLI logging is enabled.
 * Logging is enabled by default, but can be disabled via DENVIG_CLI_LOGS_ENABLED=0
 */
export const isCliLoggingEnabled = (): boolean => {
  const envValue = process.env.DENVIG_CLI_LOGS_ENABLED
  return envValue !== '0'
}

/**
 * Get the path to the CLI logs file.
 * Can be overridden via DENVIG_CLI_LOGS_PATH environment variable.
 */
export const getCliLogsPath = (): string => {
  if (process.env.DENVIG_CLI_LOGS_PATH) {
    return resolve(process.env.DENVIG_CLI_LOGS_PATH)
  }
  return resolve(homedir(), '.denvig', 'logs', 'cli.jsonl')
}

/**
 * Ensure the logs directory exists.
 */
const ensureLogsDir = async (): Promise<void> => {
  const logPath = getCliLogsPath()
  const logsDir = resolve(logPath, '..')
  await mkdir(logsDir, { recursive: true })
}

/**
 * Append a CLI usage log entry to the log file.
 * This is a fire-and-forget operation that should not block command execution.
 */
export const appendCliLog = async (entry: CliLogEntry): Promise<void> => {
  if (!isCliLoggingEnabled()) {
    return
  }

  try {
    await ensureLogsDir()
    const logPath = getCliLogsPath()
    const line = `${JSON.stringify(entry)}\n`
    await appendFile(logPath, line, 'utf-8')
  } catch {
    // Silently ignore logging errors - logging should never break CLI functionality
  }
}

/**
 * Create a CLI log entry helper.
 * Call start() before command execution and finish() after.
 */
export const createCliLogTracker = (options: {
  version: string
  command: string
  path: string
  slug?: string
  via?: string
}) => {
  const startTime = Date.now()

  return {
    /**
     * Complete the log entry and write it to the log file.
     * @param status - Exit code (0 for success, non-zero for failure)
     * @param error - Optional error message for non-zero exit codes
     */
    finish: async (status: number, error?: string): Promise<void> => {
      const entry: CliLogEntry = {
        timestamp: new Date().toISOString(),
        version: options.version,
        slug: undefined,
        command: options.command,
        via: undefined,
        duration: Date.now() - startTime,
        path: options.path,
        status,
        error: undefined,
      }

      if (options.slug !== undefined) {
        entry.slug = options.slug
      }

      if (options.via !== undefined) {
        entry.via = options.via
      }

      if (error !== undefined) {
        entry.error = error
      }

      await appendCliLog(entry)
    },
  }
}
