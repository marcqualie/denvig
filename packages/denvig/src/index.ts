/**
 * The `denvig` package is a thin wrapper around `@denvig/sdk` and `@denvig/cli`.
 *
 * The root entry re-exports the in-process SDK so consumers can keep using
 * `import { DenvigSDK } from 'denvig'`. The full CLI surface is available under
 * the `denvig/cli` subpath, and the SDK under `denvig/sdk`.
 *
 * @module
 */
export * from '@denvig/sdk'
