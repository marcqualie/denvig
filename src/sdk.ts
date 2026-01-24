import { exec } from 'node:child_process'
import { promisify } from 'node:util'

export type { ProjectConfigSchema } from './schemas/config.ts'
/**
 * Re-exported types from shared types file.
 * These are the single source of truth for CLI JSON responses.
 * @module
 */
export type {
  Dependency,
  DependencyVersion,
  OutdatedDependency,
  ProjectResponse,
  ServiceInfo,
  ServiceResponse,
  ServiceResult,
  ServiceStatus,
} from './types/responses.ts'

import type {
  Dependency,
  OutdatedDependency,
  ProjectResponse,
  ServiceResponse,
} from './types/responses.ts'

const execAsync = promisify(exec)

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

  /**
   * Client identifier for the integration using the SDK (required).
   * Used for CLI usage logging to track which integration is using the SDK.
   * Logs will include `via: 'sdk:${client}'` (e.g., `sdk:raycast`).
   */
  client: string
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
  /** Execute in the context of a specific project */
  project?: string
  /** Show subdependencies up to N levels deep */
  depth?: number
  /** Filter to a specific ecosystem (e.g., npm, rubygems, pypi) */
  ecosystem?: string
}

export type DepsOutdatedOptions = {
  /** Execute in the context of a specific project */
  project?: string
  /** Skip cache and fetch fresh data from registry */
  noCache?: boolean
  /** Filter by semver level: "patch" for patch updates only, "minor" for minor and patch updates */
  semver?: 'patch' | 'minor'
  /** Filter to a specific ecosystem (e.g., npm, rubygems, pypi) */
  ecosystem?: string
}

export type ProjectsListOptions = {
  /** Only include projects with a .denvig.yml configuration file */
  withConfig?: boolean
}

/**
 * Denvig SDK for programmatic access to the CLI.
 *
 * @example
 * ```ts
 * import { DenvigSDK } from 'denvig'
 *
 * const denvig = new DenvigSDK({ client: 'my-app' })
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
/**
 * Regex pattern for valid client names.
 * Must start with a letter, contain only lowercase alphanumeric and hyphens, and not end with a hyphen.
 */
const CLIENT_NAME_PATTERN = /^[a-z]([a-z0-9-]*[a-z0-9])?$/

export class DenvigSDK {
  private locale: string
  private cliPath: string
  private cwd: string
  private shell: string
  private via: string

  constructor(options: DenvigSDKOptions) {
    if (!CLIENT_NAME_PATTERN.test(options.client)) {
      throw new Error(
        `Invalid client name "${options.client}". Must start with a letter, contain only lowercase alphanumeric and hyphens, and not end with a hyphen.`,
      )
    }

    this.locale = options.locale ?? 'en_GB.UTF-8'
    this.cliPath = options.cliPath ?? './node_modules/.bin/denvig'
    this.cwd = options.cwd ?? process.cwd()
    this.shell = options.shell ?? '/bin/zsh'
    this.via = `sdk:${options.client}`
  }

  /**
   * Run a denvig CLI command and parse the JSON output.
   */
  private async run<T>(args: string): Promise<T> {
    try {
      const { stdout } = await execAsync(`${this.cliPath} ${args} --json`, {
        encoding: 'utf-8',
        cwd: this.cwd,
        shell: this.shell,
        env: {
          ...process.env,
          LC_ALL: this.locale,
          DENVIG_SDK_VIA: this.via,
        },
      })
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
          DENVIG_SDK_VIA: this.via,
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
     * Start a service.
     * @param name - Service name to start
     */
    start: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<ServiceResponse>(`services start ${name} ${flags}`.trim())
    },

    /**
     * Stop a service.
     * @param name - Service name to stop
     */
    stop: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<ServiceResponse>(`services stop ${name} ${flags}`.trim())
    },

    /**
     * Restart a service.
     * @param name - Service name to restart
     */
    restart: async (
      name: string,
      options?: ServiceOperationOptions,
    ): Promise<ServiceResponse> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<ServiceResponse>(
        `services restart ${name} ${flags}`.trim(),
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

  /**
   * Project management commands.
   */
  projects = {
    /**
     * List all projects on the system.
     */
    list: async (options?: ProjectsListOptions): Promise<ProjectResponse[]> => {
      const flags = options ? this.buildFlags(options) : ''
      return this.run<ProjectResponse[]>(`projects list ${flags}`.trim())
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
