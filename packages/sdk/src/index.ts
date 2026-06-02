/**
 * `@denvig/sdk` — the in-process logic layer behind the denvig CLI.
 *
 * This barrel exposes the public, programmatic SDK surface. Internal modules
 * are additionally reachable via subpath imports (e.g. `@denvig/sdk/lib/...`)
 * for the CLI, which is built on top of these same primitives.
 *
 * @module
 */

export {
  DenvigError,
  DenvigOperationError,
  DenvigSDKError,
  DenvigValidationError,
} from './lib/errors.ts'
export { getDenvigVersion } from './lib/version.ts'
export { DenvigSDK } from './sdk.ts'

export type { ProjectInfo } from './lib/projectInfo.ts'
export type { PluginInfo } from './operations/plugins.ts'
export type { ProjectConfigSchema } from './schemas/config.ts'
export type {
  DenvigSDKOptions,
  DepsListOptions,
  DepsOutdatedOptions,
  ListServicesOptions,
  ProjectsListOptions,
  ServiceOperationOptions,
} from './sdk.ts'
/**
 * Shared response types — the single source of truth for CLI JSON responses
 * and SDK return values.
 */
export type {
  Dependency,
  DependencyVersion,
  OutdatedDependency,
  ProjectResponse,
  ServiceInfo,
  ServiceProjectData,
  ServiceResponse,
  ServiceResult,
  ServiceStatus,
} from './types/responses.ts'
