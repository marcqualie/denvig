/**
 * The `denvig` package is a thin wrapper around `@denvig/cli`.
 *
 * The root entry re-exports the SDK so existing consumers can keep using
 * `import { DenvigSDK } from 'denvig'`. The full CLI surface is also available
 * under the `denvig/cli` subpath.
 *
 * @module
 */
export * from '@denvig/cli'
