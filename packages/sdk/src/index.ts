/**
 * `@denvig/sdk` — the in-process logic layer behind the denvig CLI.
 *
 * This barrel is the SDK's stable public interface. Construct a {@link DenvigSDK},
 * resolve a project via `denvig.projects.retrieve(...)`, then chain into its
 * worktrees, actions, services, dependencies and config. See `docs/sdk.md`.
 *
 * Internals are intentionally not exported here so they can be refactored
 * without breaking consumers. CLI-only building blocks that are not yet part of
 * this contract live under `@denvig/sdk/unsafe`.
 *
 * @module
 */

export {
  DenvigError,
  DenvigOperationError,
  DenvigSDKError,
  DenvigValidationError,
} from './lib/errors.ts'
export { DenvigAction } from './resources/action.ts'
export { DenvigProject } from './resources/project.ts'
export { DenvigService } from './resources/service.ts'
export { DenvigWorktree } from './resources/worktree.ts'
export { DenvigSDK } from './sdk.ts'

export type { TreeNode } from './lib/formatters/tree-node.ts'
export type {
  ProjectInfo,
  ServiceStatus as ProjectServiceStatus,
} from './lib/projectInfo.ts'
export type { CaStatus, DenvigCertificate } from './operations/certs.ts'
export type { GatewayStatus } from './operations/gateway.ts'
export type { ServiceRow } from './operations/services.ts'
export type { DenvigConfig } from './resources/config.ts'
export type { DenvigDependency } from './resources/dependency.ts'
export type { DenvigSDKOptions } from './sdk.ts'
export type { ServiceResponse } from './types/responses.ts'
