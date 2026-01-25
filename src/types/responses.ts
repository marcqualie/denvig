/**
 * Shared response types for CLI JSON output and SDK.
 * This is the single source of truth for all JSON response shapes.
 * @module
 */

import type { ProjectInfo } from '../lib/projectInfo.ts'
import type { ProjectConfigSchema } from '../schemas/config.ts'

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
  startOnBoot?: boolean
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
 * Project data included in service responses.
 */
export type ServiceProjectData = {
  id: string
  slug: string
  name: string
  path: string
}

/**
 * Unified service response for all service commands.
 * Used by list, status, start, stop, and restart commands.
 */
export type ServiceResponse = {
  name: string
  project: ServiceProjectData
  status: 'running' | 'error' | 'stopped'
  pid: number | null
  url: string | null
  command: string
  cwd: string
  logPath: string
  envFiles: string[]
  lastExitCode: number | null
  logs?: string[]
}

/**
 * Version information for a dependency.
 */
export type DependencyVersion = {
  resolved: string
  specifier: string
  source: string
  wanted?: string
  latest?: string
}

/**
 * A project dependency from deps:list command.
 */
export type Dependency = {
  id: string
  name: string
  versions: DependencyVersion[]
  ecosystem: string
}

/**
 * An outdated dependency from deps:outdated command.
 */
export type OutdatedDependency = Dependency & {
  wanted: string
  latest: string
  specifier: string
  isDevDependency: boolean
}

/**
 * A project from projects:list and info commands.
 * Re-exported from lib/projectInfo.ts for backwards compatibility.
 */
export type ProjectResponse = ProjectInfo
