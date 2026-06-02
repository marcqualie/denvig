/**
 * The `@denvig/cli` `.` export re-exposes the SDK for backwards compatibility,
 * so `import { DenvigSDK } from '@denvig/cli'` keeps working. The SDK now lives
 * in `@denvig/sdk` and runs in-process rather than shelling out to the binary.
 *
 * @module
 */
export * from '@denvig/sdk'
