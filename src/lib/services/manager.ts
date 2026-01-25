import {
  access,
  appendFile,
  mkdir,
  readdir,
  readFile,
  unlink,
  writeFile,
} from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import { DEFAULT_ENV_FILES, loadEnvFiles } from './env.ts'
import launchctl, { type LaunchctlListItem } from './launchctl.ts'
import { generatePlist } from './plist.ts'

import type { ProjectConfigSchema } from '../../schemas/config.ts'
import type { DenvigProject } from '../project.ts'

// Re-export service types from shared types file
export type {
  ServiceInfo,
  ServiceResponse,
  ServiceResult,
  ServiceStatus,
} from '../../types/responses.ts'

import type {
  ServiceInfo,
  ServiceResponse,
  ServiceResult,
  ServiceStatus,
} from '../../types/responses.ts'

type ServiceConfig = NonNullable<ProjectConfigSchema['services']>[string]

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
      startOnBoot: config.startOnBoot,
    }))
  }

  /**
   * Build environment variables for a service.
   * This loads env files and merges with explicit env config.
   * All env files are optional - missing files are silently skipped.
   */
  async buildServiceEnvironment(
    name: string,
  ): Promise<
    | { success: true; env: Record<string, string> }
    | { success: false; message: string }
  > {
    const config = this.getServiceConfig(name)
    if (!config) {
      return {
        success: false,
        message: `Service "${name}" not found in configuration`,
      }
    }

    const workingDirectory = this.resolveServiceCwd(config)

    // Build environment variables
    const environmentVariables: Record<string, string> = {
      DENVIG_PROJECT: this.project.slug,
      DENVIG_SERVICE: name,
    }

    // Load environment variables from files (later files override earlier)
    // Files are resolved relative to the service's working directory
    // All env files are optional - missing files are silently skipped
    // - undefined: use defaults (.env.development, .env.local)
    // - []: use no env files (explicit override)
    // - [...]: use specified files
    const envFilesToLoad = config.envFiles ?? DEFAULT_ENV_FILES

    if (envFilesToLoad.length > 0) {
      try {
        const envFilePaths = envFilesToLoad.map((f) =>
          resolve(workingDirectory, f),
        )
        const envFromFiles = await loadEnvFiles(envFilePaths, {
          skipMissing: true,
        })
        Object.assign(environmentVariables, envFromFiles)
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : 'Unknown error'
        return {
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

    return { success: true, env: environmentVariables }
  }

  /**
   * Start a specific service.
   */
  async startService(name: string): Promise<ServiceResult> {
    const envResult = await this.buildServiceEnvironment(name)
    if (!envResult.success) {
      return {
        name,
        success: false,
        message: envResult.message,
      }
    }

    const config = this.getServiceConfig(name)!
    const label = this.getServiceLabel(name)
    const isBootstrapped = await this.isServiceBootstrapped(name)

    // Ensure denvig directories exist
    await this.ensureDenvigDirectories()

    // Ensure plist file exists
    const plistPath = this.getPlistPath(name)
    const workingDirectory = this.resolveServiceCwd(config)

    const plistContent = generatePlist({
      label,
      command: config.command,
      workingDirectory,
      environmentVariables: envResult.env,
      standardOutPath: this.getLogPath(name, 'stdout'),
      keepAlive: config.keepAlive ?? true,
      runAtLoad: config.startOnBoot ?? false,
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

    // For startOnBoot services, use stop() to keep them registered for next boot
    // For regular services, use bootout() to fully unload them
    if (config.startOnBoot) {
      const result = await launchctl.stop(label)
      if (!result.success) {
        return {
          name,
          success: false,
          message: `Failed to stop service: ${result.output}`,
        }
      }
      // Keep plist file so service starts on next boot
    } else {
      const result = await launchctl.bootout(label)
      if (!result.success) {
        return {
          name,
          success: false,
          message: `Failed to stop service: ${result.output}`,
        }
      }
      // Remove plist file so service doesn't restart on reboot
      try {
        await unlink(this.getPlistPath(name))
      } catch {
        // Ignore errors removing plist file (may not exist)
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
    const serviceNames = Object.keys(services)

    return await Promise.all(
      serviceNames.map((name) => this.startService(name)),
    )
  }

  /**
   * Stop all running services.
   */
  async stopAll(): Promise<ServiceResult[]> {
    const services = this.project.config.services || {}
    const serviceNames = Object.keys(services)

    // First, check which services are bootstrapped (in parallel)
    const bootstrapChecks = await Promise.all(
      serviceNames.map(async (name) => ({
        name,
        isBootstrapped: await this.isServiceBootstrapped(name),
      })),
    )

    // Filter to only bootstrapped services
    const bootstrappedServices = bootstrapChecks
      .filter((check) => check.isBootstrapped)
      .map((check) => check.name)

    // Stop all bootstrapped services in parallel
    return await Promise.all(
      bootstrappedServices.map((name) => this.stopService(name)),
    )
  }

  /**
   * Restart all services (only those currently bootstrapped).
   */
  async restartAll(): Promise<ServiceResult[]> {
    const services = this.project.config.services || {}
    const serviceNames = Object.keys(services)

    // First, check which services are bootstrapped (in parallel)
    const bootstrapChecks = await Promise.all(
      serviceNames.map(async (name) => ({
        name,
        isBootstrapped: await this.isServiceBootstrapped(name),
      })),
    )

    // Filter to only bootstrapped services
    const bootstrappedServices = bootstrapChecks
      .filter((check) => check.isBootstrapped)
      .map((check) => check.name)

    // Restart all bootstrapped services in parallel
    return await Promise.all(
      bootstrappedServices.map((name) => this.restartService(name)),
    )
  }

  /**
   * Teardown all services for this project.
   * Stops all services, removes them from launchctl, and deletes plist files.
   * @param options.removeLogs - Also remove log files (default: false)
   */
  async teardownAll(options?: {
    removeLogs?: boolean
  }): Promise<ServiceResult[]> {
    const results: ServiceResult[] = []
    const labelPrefix = `denvig.${this.project.id}.`
    const successfullyRemovedLabels: string[] = []

    // Get all denvig services for this project from launchctl
    const allServices = await launchctl.list(labelPrefix)

    // Bootout all services from launchctl
    for (const service of allServices) {
      const bootoutResult = await launchctl.bootout(service.label)
      const serviceName = service.label.replace(labelPrefix, '')

      if (!bootoutResult.success) {
        results.push({
          name: serviceName,
          success: false,
          message: `Failed to bootout: ${bootoutResult.output}`,
        })
      } else {
        successfullyRemovedLabels.push(service.label)
        results.push({
          name: serviceName,
          success: true,
          message: 'Service removed from launchctl',
        })
      }
    }

    // Only remove plist files for services that were successfully booted out
    const launchAgentsDir = resolve(homedir(), 'Library', 'LaunchAgents')
    await Promise.all(
      successfullyRemovedLabels.map(async (label) => {
        try {
          await unlink(resolve(launchAgentsDir, `${label}.plist`))
        } catch {
          // Ignore errors removing individual plist files
        }
      }),
    )

    // Optionally remove log files for successfully removed services
    if (options?.removeLogs && successfullyRemovedLabels.length > 0) {
      const logsDir = resolve(this.getDenvigHomeDir(), 'logs')

      // Extract log prefixes from labels (format: denvig.{projectId}.{serviceName})
      const serviceLogPrefixes = successfullyRemovedLabels.map((label) => {
        // Label format: denvig.{projectId}.{serviceName}
        // Log format: {projectId}.{serviceName}.log
        return label.replace('denvig.', '')
      })

      await Promise.all(
        serviceLogPrefixes.flatMap((prefix) => [
          // Remove stdout log
          unlink(resolve(logsDir, `${prefix}.log`)).catch(() => {}),
          // Remove stderr log
          unlink(resolve(logsDir, `${prefix}.error.log`)).catch(() => {}),
        ]),
      )
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
   * Format: denvig.[projectId].[serviceName]
   */
  getServiceLabel(name: string): string {
    const normalizedName = this.normalizeForLabel(name)
    return `denvig.${this.project.id}.${normalizedName}`
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
   * Format: [projectId].[serviceName].log or [projectId].[serviceName].error.log
   */
  getLogPath(name: string, type: 'stdout' | 'stderr'): string {
    const normalizedName = this.normalizeForLabel(name)
    const suffix = type === 'stderr' ? '.error' : ''
    return resolve(
      this.getDenvigHomeDir(),
      'logs',
      `${this.project.id}.${normalizedName}${suffix}.log`,
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
   * Check if a plist file exists for a service.
   */
  async plistExists(name: string): Promise<boolean> {
    try {
      await access(this.getPlistPath(name))
      return true
    } catch {
      return false
    }
  }

  /**
   * Get a unified service response for a service.
   * Returns null if the service is not found in configuration.
   * @param name - Service name
   * @param options.includeLogs - Whether to include recent logs (default: false)
   * @param options.logLines - Number of log lines to include (default: 20)
   * @param options.launchctlList - Pre-fetched launchctl list for batch operations (avoids N shell calls)
   */
  async getServiceResponse(
    name: string,
    options?: {
      includeLogs?: boolean
      logLines?: number
      launchctlList?: LaunchctlListItem[]
    },
  ): Promise<ServiceResponse | null> {
    const config = this.getServiceConfig(name)
    if (!config) {
      return null
    }

    const label = this.getServiceLabel(name)

    let status: 'running' | 'error' | 'stopped' = 'stopped'
    let pid: number | null = null
    let lastExitCode: number | null = null

    // If launchctlList is provided, use it for fast batch lookup
    if (options?.launchctlList) {
      const listItem = options.launchctlList.find(
        (item) => item.label === label,
      )
      if (listItem) {
        pid = listItem.pid === '-' ? null : listItem.pid
        lastExitCode = listItem.status

        if (pid !== null) {
          // Has a PID, so it's running
          status = lastExitCode !== 0 ? 'error' : 'running'
        } else {
          // No PID but in list - check exit code
          status = lastExitCode !== 0 ? 'error' : 'stopped'
        }
      }
      // If not in list, status remains 'stopped'
    } else {
      // Fallback to individual launchctl.print call (slower)
      // First check if plist exists to avoid unnecessary shell calls
      const hasPlist = await this.plistExists(name)
      if (hasPlist) {
        const info = await launchctl.print(label)
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
      }
    }

    const response: ServiceResponse = {
      name,
      project: {
        id: this.project.id,
        slug: this.project.slug,
        name: this.project.name,
        path: this.project.path,
      },
      status,
      pid,
      url: this.getServiceUrl(name),
      command: config.command,
      cwd: this.resolveServiceCwd(config),
      logPath: this.getLogPath(name, 'stdout'),
      envFiles: (config.envFiles ?? DEFAULT_ENV_FILES).map((f) =>
        resolve(this.resolveServiceCwd(config), f),
      ),
      lastExitCode,
    }

    if (options?.includeLogs) {
      response.logs = await this.getRecentLogs(name, options.logLines ?? 20)
    }

    return response
  }
}
