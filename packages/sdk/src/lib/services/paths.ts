import { homedir } from 'node:os'
import { resolve } from 'node:path'

/**
 * Normalize a service name for use in filesystem paths and launchctl labels.
 * Keeps a single source of truth for how a service maps to its on-disk id.
 */
export function normalizeServiceLabel(name: string): string {
  return name
    .replace(/\//g, '__') // Replace path separators with double underscore
    .replace(/:/g, '-') // Replace colons with dashes
    .replace(/[^a-zA-Z0-9_.-]/g, '_') // Replace other special chars with underscore
}

/**
 * Stable, host-agnostic log path for a service. This is the symlink that
 * always points at the current timestamped log file.
 * Format: ~/.denvig/services/[projectId].[serviceName]/logs/latest.log
 */
export function getServiceStableLogPath(
  projectId: string,
  serviceName: string,
): string {
  const serviceId = `${projectId}.${normalizeServiceLabel(serviceName)}`
  return resolve(
    homedir(),
    '.denvig',
    'services',
    serviceId,
    'logs',
    'latest.log',
  )
}
