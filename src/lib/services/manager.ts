import { appendFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { parseEnvFile } from './env.ts'
import launchctl from './launchctl.ts'
import { generatePlist } from './plist.ts'

import type { ProjectConfigSchema } from '../../schemas/config.ts'
import type { DenvigProject } from '../project.ts'

type ServiceConfig = NonNullable<ProjectConfigSchema['services']>[string]

/**
 * Service information for display.
 */
export type ServiceInfo = {
  name: string
  cwd: string
  command: string
  http?: {
    port?: number
    domain?: string
    secure?: boolean
  }
}

/**
 * Result of a service operation.
 */
export type ServiceResult = {
  name: string
  success: boolean
  message: string
}

/**
 * Status of a running service.
 */
export type ServiceStatus = {
  name: string
  running: boolean
  pid?: number
  uptime?: string
  command: string
  cwd: string
  logs?: string[]
  logPath: string
  lastExitCode?: number
}

/**
 * Unified service response for all service commands.
 * Used by list, status, start, stop, and restart commands.
 */
export type ServiceResponse = {
  name: string
  project: string
  status: 'running' | 'error' | 'stopped'
  pid: number | null
  url: string | null
  command: string
  cwd: string
  logPath: string
  envFile: string | null
  lastExitCode: number | null
  logs?: string[]
}

/**
 * Manager for project services.
 */
export class ServiceManager {
  private project: DenvigProject

  constructor(project: DenvigProject) {
    this.project = project
  }

  /**
   * List all services defined in the project configuration.
   */
  async listServices(): Promise<ServiceInfo[]> {
    const services = this.project.config.services || {}

    return Object.entries(services).map(([name, config]) => ({
      name,
      cwd: config.cwd || '.',
      command: config.command,
      http: config.http,
    }))
  }

  /**
   * Start a specific service.
   */
  async startService(name: string): Promise<ServiceResult> {
    const config = this.getServiceConfig(name)
    if (!config) {
      return {
        name,
        success: false,
        message: `Service "${name}" not found in configuration`,
      }
    }

    const label = this.getServiceLabel(name)
    const isBootstrapped = await this.isServiceBootstrapped(name)

    // Ensure denvig directories exist
    await this.ensureDenvigDirectories()

    // Ensure plist file exists
    const plistPath = this.getPlistPath(name)
    const workingDirectory = this.resolveServiceCwd(config)

    // Build environment variables
    const environmentVariables: Record<string, string> = {
      DENVIG_PROJECT: this.project.slug,
      DENVIG_SERVICE: name,
    }

    // Load environment variables from file if specified
    if (config.envFile) {
      try {
        const envFilePath = resolve(this.project.path, config.envFile)
        const envFromFile = await parseEnvFile(envFilePath)
        Object.assign(environmentVariables, envFromFile)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        return {
          name,
          success: false,
          message: `Failed to load environment file: ${errorMessage}`,
        }
      }
    }

    // Merge with explicit env variables (these take precedence)
    if (config.env) {
      Object.assign(environmentVariables, config.env)
    }

    // Add PORT environment variable if port is configured
    if (config.http?.port !== undefined) {
      environmentVariables.PORT = config.http.port.toString()
    }

    const plistContent = generatePlist({
      label,
      command: config.command,
      workingDirectory,
      environmentVariables,
      standardOutPath: this.getLogPath(name, 'stdout'),
      standardErrorPath: this.getLogPath(name, 'stderr'),
      keepAlive: config.keepAlive ?? true,
    })

    await writeFile(plistPath, plistContent, 'utf-8')

    // Bootstrap or reload using the plist directly in ~/Library/LaunchAgents
    if (!isBootstrapped) {
      const bootstrapResult = await launchctl.bootstrap(plistPath)
      if (!bootstrapResult.success) {
        return {
          name,
          success: false,
          message: `Failed to bootstrap service: ${bootstrapResult.output}`,
        }
      }
    } else {
      // If already bootstrapped, bootout and bootstrap again to reload the plist
      const bootoutResult = await launchctl.bootout(label)
      if (!bootoutResult.success) {
        return {
          name,
          success: false,
          message: `Failed to bootout service: ${bootoutResult.output}`,
        }
      }

      // sleep for 1 second to allow bootout to complete
      await new Promise((resolve) => setTimeout(resolve, 1000))
      const bootstrapResult = await launchctl.bootstrap(plistPath)
      if (!bootstrapResult.success) {
        return {
          name,
          success: false,
          message: `Failed to bootstrap service: ${bootstrapResult.output}`,
        }
      }
    }

    // Append Service Started entry to stdout log
    try {
      const timestamp = new Date().toISOString()
      await appendFile(
        this.getLogPath(name, 'stdout'),
        `[${timestamp}] Service Started\n`,
        'utf-8',
      )
    } catch {
      // ignore logging errors
    }

    return {
      name,
      success: true,
      message: 'Service started successfully',
    }
  }

  /**
   * Stop a specific service.
   */
  async stopService(name: string): Promise<ServiceResult> {
    const config = this.getServiceConfig(name)
    if (!config) {
      return {
        name,
        success: false,
        message: `Service "${name}" not found in configuration`,
      }
    }

    const label = this.getServiceLabel(name)
    const isBootstrapped = await this.isServiceBootstrapped(name)

    if (!isBootstrapped) {
      return {
        name,
        success: false,
        message: `Service "${name}" is not running`,
      }
    }

    // Bootout the service (unload it completely to prevent KeepAlive restart)
    const result = await launchctl.bootout(label)

    if (!result.success) {
      return {
        name,
        success: false,
        message: `Failed to stop service: ${result.output}`,
      }
    }

    // Append Service Stopped entry to stdout log
    try {
      const timestamp = new Date().toISOString()
      await appendFile(
        this.getLogPath(name, 'stdout'),
        `[${timestamp}] Service Stopped\n`,
        'utf-8',
      )
    } catch {
      // ignore logging errors
    }

    return {
      name,
      success: true,
      message: 'Service stopped successfully',
    }
  }

  /**
   * Restart a specific service.
   */
  async restartService(name: string): Promise<ServiceResult> {
    const config = this.getServiceConfig(name)
    if (!config) {
      return {
        name,
        success: false,
        message: `Service "${name}" not found in configuration`,
      }
    }

    const isBootstrapped = await this.isServiceBootstrapped(name)

    // Stop the service if bootstrapped
    if (isBootstrapped) {
      const stopResult = await this.stopService(name)
      if (!stopResult.success) {
        return stopResult
      }
    }

    // Start the service
    return await this.startService(name)
  }

  /**
   * Get the status of a specific service.
   */
  async getServiceStatus(name: string): Promise<ServiceStatus | null> {
    const config = this.getServiceConfig(name)
    if (!config) {
      return null
    }

    const label = this.getServiceLabel(name)
    const info = await launchctl.print(label)

    if (!info) {
      return {
        name,
        running: false,
        command: config.command,
        cwd: this.resolveServiceCwd(config),
        logPath: this.getLogPath(name, 'stdout'),
      }
    }

    // Read recent logs
    const logs = await this.getRecentLogs(name, 20)

    return {
      name,
      running: info.state === 'running',
      pid: info.pid,
      command: config.command,
      cwd: this.resolveServiceCwd(config),
      logs,
      logPath: this.getLogPath(name, 'stdout'),
      lastExitCode: info.lastExitCode,
    }
  }

  /**
   * Start all services.
   */
  async startAll(): Promise<ServiceResult[]> {
    const services = this.project.config.services || {}
    const results: ServiceResult[] = []

    for (const name of Object.keys(services)) {
      results.push(await this.startService(name))
    }

    return results
  }

  /**
   * Stop all running services.
   */
  async stopAll(): Promise<ServiceResult[]> {
    const services = this.project.config.services || {}
    const results: ServiceResult[] = []

    for (const name of Object.keys(services)) {
      const isBootstrapped = await this.isServiceBootstrapped(name)
      if (isBootstrapped) {
        results.push(await this.stopService(name))
      }
    }

    return results
  }

  /**
   * Restart all services (only those currently bootstrapped).
   */
  async restartAll(): Promise<ServiceResult[]> {
    const services = this.project.config.services || {}
    const results: ServiceResult[] = []

    for (const name of Object.keys(services)) {
      const isBootstrapped = await this.isServiceBootstrapped(name)
      if (isBootstrapped) {
        results.push(await this.restartService(name))
      }
    }

    return results
  }

  /**
   * Check if a service is bootstrapped (loaded in launchctl).
   */
  async isServiceBootstrapped(name: string): Promise<boolean> {
    const label = this.getServiceLabel(name)
    const info = await launchctl.print(label)
    return info !== null
  }

  /**
   * Normalize a string for use in launchctl labels and filenames.
   * Replaces special characters with safe alternatives.
   */
  private normalizeForLabel(str: string): string {
    return str
      .replace(/\//g, '__') // Replace path separators with double underscore
      .replace(/:/g, '-') // Replace colons with dashes
      .replace(/[^a-zA-Z0-9_.-]/g, '_') // Replace other special chars with underscore
  }

  /**
   * Get the service label for launchctl.
   * Format: denvig.[workspace]__[repo]__[service]
   */
  getServiceLabel(name: string): string {
    const normalizedSlug = this.normalizeForLabel(this.project.slug)
    const normalizedName = this.normalizeForLabel(name)
    return `denvig.${normalizedSlug}__${normalizedName}`
  }

  /**
   * Get the denvig directory path.
   */
  getDenvigHomeDir(): string {
    return resolve(homedir(), '.denvig')
  }

  /**
   * Get the plist file path.
   */
  getPlistPath(name: string): string {
    const label = this.getServiceLabel(name)
    return resolve(homedir(), 'Library', 'LaunchAgents', `${label}.plist`)
  }

  /**
   * Get the log file path.
   * Format: [workspace]__[repo]__[service].log or [workspace]__[repo]__[service].error.log
   */
  getLogPath(name: string, type: 'stdout' | 'stderr'): string {
    const normalizedSlug = this.normalizeForLabel(this.project.slug)
    const normalizedName = this.normalizeForLabel(name)
    const suffix = type === 'stderr' ? '.error' : ''
    return resolve(
      this.getDenvigHomeDir(),
      'logs',
      `${normalizedSlug}__${normalizedName}${suffix}.log`,
    )
  }

  /**
   * Ensure denvig directories exist.
   */
  async ensureDenvigDirectories(): Promise<void> {
    const denvigDir = this.getDenvigHomeDir()
    await mkdir(resolve(denvigDir, 'logs'), { recursive: true })
  }

  /**
   * Get recent log lines from a service.
   */
  async getRecentLogs(name: string, lines: number): Promise<string[]> {
    try {
      const logPath = this.getLogPath(name, 'stdout')
      const content = await readFile(logPath, 'utf-8')
      const allLines = content.trim().split('\n')
      return allLines.slice(-lines)
    } catch {
      return []
    }
  }

  /**
   * Resolve the absolute working directory for a service.
   */
  private resolveServiceCwd(config: ServiceConfig): string {
    return resolve(this.project.path, config.cwd || '.')
  }

  /**
   * Get the configuration for a specific service.
   */
  getServiceConfig(name: string): ServiceConfig | undefined {
    return this.project.config.services?.[name]
  }

  /**
   * Get the URL where a service can be accessed.
   */
  getServiceUrl(name: string): string | null {
    const config = this.getServiceConfig(name)
    if (!config) {
      return null
    }

    if (config.http?.domain) {
      const protocol = config.http.secure ? 'https' : 'http'
      return `${protocol}://${config.http.domain}`
    }

    if (config.http?.port) {
      return `http://localhost:${config.http.port}`
    }

    return null
  }

  /**
   * Get a unified service response for a service.
   * Returns null if the service is not found in configuration.
   * @param name - Service name
   * @param options.includeLogs - Whether to include recent logs (default: false)
   * @param options.logLines - Number of log lines to include (default: 20)
   */
  async getServiceResponse(
    name: string,
    options?: { includeLogs?: boolean; logLines?: number },
  ): Promise<ServiceResponse | null> {
    const config = this.getServiceConfig(name)
    if (!config) {
      return null
    }

    const label = this.getServiceLabel(name)
    const info = await launchctl.print(label)

    let status: 'running' | 'error' | 'stopped' = 'stopped'
    let pid: number | null = null
    let lastExitCode: number | null = null

    if (info) {
      pid = info.pid ?? null
      lastExitCode = info.lastExitCode ?? null

      if (info.state === 'running') {
        // Check for error state (running but with non-zero exit code)
        if (lastExitCode !== null && lastExitCode !== 0) {
          status = 'error'
        } else {
          status = 'running'
        }
      }
    }

    const response: ServiceResponse = {
      name,
      project: this.project.slug,
      status,
      pid,
      url: this.getServiceUrl(name),
      command: config.command,
      cwd: this.resolveServiceCwd(config),
      logPath: this.getLogPath(name, 'stdout'),
      envFile: config.envFile
        ? resolve(this.project.path, config.envFile)
        : null,
      lastExitCode,
    }

    if (options?.includeLogs) {
      response.logs = await this.getRecentLogs(name, options.logLines ?? 20)
    }

    return response
  }
}
