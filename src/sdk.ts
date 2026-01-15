import { exec } from 'node:child_process'
import { promisify } from 'node:util'

/**
 * Re-exported types from shared types file.
 * These are the single source of truth for CLI JSON responses.
 * @module
 */
export type {
  Dependency,
  DependencyVersion,
  OutdatedDependency,
  ServiceInfo,
  ServiceResponse,
  ServiceResult,
  ServiceStatus,
} from './types/responses.ts'

import type {
  Dependency,
  OutdatedDependency,
  ServiceResponse,
} from './types/responses.ts'

const execAsync = promisify(exec)

/**
 * Response when starting/stopping/restarting all services in a project.
 */
export type ServiceBulkResponse = {
  success: boolean
  project: string
  services: ServiceResponse[]
}

/**
 * Response when a service operation fails.
 */
export type ServiceOperationError = {
  success: false
  service: string
  project: string
  message: string
}

export type DenvigSDKOptions = {
  /**
   * Locale to use for shell commands.
   * @default 'en_GB.UTF-8'
   */
  locale?: string

  /**
   * Path to the denvig CLI binary.
   * @default './node_modules/.bin/denvig'
   */
  cliPath?: string

  /**
   * Working directory to run commands in.
   * @default process.cwd()
   */
  cwd?: string

  /**
   * Shell to use for executing commands.
   * @default '/bin/zsh'
   */
  shell?: string
}

export type ListServicesOptions = {
  /** Filter to a specific project slug */
  project?: string
}

export type ServiceOperationOptions = {
  /** Filter to a specific project slug */
  project?: string
}

export type DepsListOptions = {
  /** Show subdependencies up to N levels deep */
  depth?: number
  /** Filter to a specific ecosystem (e.g., npm, rubygems, pypi) */
  ecosystem?: string
}

export type DepsOutdatedOptions = {
  /** Skip cache and fetch fresh data from registry */
  noCache?: boolean
  /** Filter by semver level: "patch" for patch updates only, "minor" for minor and patch updates */
  semver?: 'patch' | 'minor'
  /** Filter to a specific ecosystem (e.g., npm, rubygems, pypi) */
  ecosystem?: string
}

/**
 * Denvig SDK for programmatic access to the CLI.
 *
 * @example
 * ```ts
 * import { DenvigSDK } from 'denvig'
 *
 * const denvig = new DenvigSDK()
 *
 * // List all services across all projects
 * const services = await denvig.services.list()
 *
 * // Start a specific service
 * const result = await denvig.services.start('api')
 *
 * // Get outdated dependencies
 * const outdated = await denvig.deps.outdated()
 * ```
 */
export class DenvigSDK {
  private locale: string
  private cliPath: string
  private cwd: string
  private shell: string

  constructor(options: DenvigSDKOptions = {}) {
    this.locale = options.locale ?? 'en_GB.UTF-8'
    this.cliPath = options.cliPath ?? './node_modules/.bin/denvig'
    this.cwd = options.cwd ?? process.cwd()
    this.shell = options.shell ?? '/bin/zsh'
  }

  /**
   * Run a denvig CLI command and parse the JSON output.
   */
  private async run<T>(args: string): Promise<T> {
    try {
      const { stdout } = await execAsync(
        `${this.cliPath} ${args} --format json`,
        {
          encoding: 'utf-8',
          cwd: this.cwd,
          shell: this.shell,
          env: {
            ...process.env,
            LC_ALL: this.locale,
          },
        },
      )
      return JSON.parse(stdout) as T
    } catch (error) {
      const execError = error as {
        stderr?: string
        stdout?: string
        message?: string
        code?: number
      }

      // Try to parse JSON from stdout even on error (CLI may return non-zero exit codes with valid JSON)
      if (execError.stdout) {
        try {
          return JSON.parse(execError.stdout) as T
        } catch {
          // Not valid JSON, throw original error
        }
      }

      throw new DenvigSDKError(
        `Command failed: denvig ${args}`,
        execError.message,
        execError.stderr,
        execError.stdout,
      )
    }
  }

  /**
   * Run a denvig CLI command that returns plain text (like version).
   */
  private async runText(args: string): Promise<string> {
    try {
      const { stdout } = await execAsync(`${this.cliPath} ${args}`, {
        encoding: 'utf-8',
        cwd: this.cwd,
        shell: this.shell,
        env: {
          ...process.env,
          LC_ALL: this.locale,
        },
      })
      return stdout.trim()
    } catch (error) {
      const execError = error as {
        stderr?: string
        stdout?: string
        message?: string
      }
      throw new DenvigSDKError(
        `Command failed: denvig ${args}`,
        execError.message,
        execError.stderr,
        execError.stdout,
      )
    }
  }

  /**
   * Build flag string from options object.
   */
  private buildFlags(options: Record<string, unknown>): string {
    const flags: string[] = []
    for (const [key, value] of Object.entries(options)) {
      if (value === undefined || value === null) continue

      // Convert camelCase to kebab-case
      const flag = key.replace(/([A-Z])/g, '-$1').toLowerCase()

      if (typeof value === 'boolean') {
        if (value) {
          flags.push(`--${flag}`)
        }
      } else {
        flags.push(`--${flag}`, String(value))
      }
    }
    return flags.join(' ')
  }

  /**
   * Get the version of the denvig CLI.
   */
  async version(): Promise<string> {
    const output = await this.runText('version')
    // Remove 'v' prefix if present
    return output.replace(/^v/, '')
  }

  /**
   * Service management commands.
   */
  services = {
    /**
     * List all services across all projects.
     */
    list: async (options?: ListServicesOptions): Promise<ServiceResponse[]> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<ServiceResponse[]>(`services ${flags}`.trim())
    },

    /**
     * Get the status of a specific service.
     */
    status: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<ServiceResponse>(
        `services status ${name} ${flags}`.trim(),
      )
    },

    /**
     * Start a service or all services.
     * @param name - Service name to start, or omit to start all services in the project
     */
    start: async (
      name?: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse | ServiceBulkResponse> => {
      const flags = options ? this.buildFlags(options) : ''
      const nameArg = name ?? ''
      return this.run<ServiceResponse | ServiceBulkResponse>(
        `services start ${nameArg} ${flags}`.trim(),
      )
    },

    /**
     * Stop a service or all services.
     * @param name - Service name to stop, or omit to stop all services in the project
     */
    stop: async (
      name?: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse | ServiceBulkResponse> => {
      const flags = options ? this.buildFlags(options) : ''
      const nameArg = name ?? ''
      return this.run<ServiceResponse | ServiceBulkResponse>(
        `services stop ${nameArg} ${flags}`.trim(),
      )
    },

    /**
     * Restart a service or all services.
     * @param name - Service name to restart, or omit to restart all services in the project
     */
    restart: async (
      name?: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse | ServiceBulkResponse> => {
      const flags = options ? this.buildFlags(options) : ''
      const nameArg = name ?? ''
      return this.run<ServiceResponse | ServiceBulkResponse>(
        `services restart ${nameArg} ${flags}`.trim(),
      )
    },
  }

  /**
   * Dependency management commands.
   */
  deps = {
    /**
     * List all dependencies in the project.
     */
    list: async (options?: DepsListOptions): Promise<Dependency[]> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<Dependency[]>(`deps list ${flags}`.trim())
    },

    /**
     * List outdated dependencies in the project.
     */
    outdated: async (
      options?: DepsOutdatedOptions,
    ): Promise<OutdatedDependency[]> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<OutdatedDependency[]>(`deps outdated ${flags}`.trim())
    },
  }
}

/**
 * Error thrown when a denvig CLI command fails.
 */
export class DenvigSDKError extends Error {
  constructor(
    message: string,
    public readonly originalMessage?: string,
    public readonly stderr?: string,
    public readonly stdout?: string,
  ) {
    super(message)
    this.name = 'DenvigSDKError'
  }
}

export default DenvigSDK
