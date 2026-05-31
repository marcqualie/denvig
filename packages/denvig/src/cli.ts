/**
 * Re-export of `@denvig/cli`, surfaced as the `denvig/cli` subpath.
 *
 * During development this resolves to the workspace package via a
 * `workspace:` dependency; when published it resolves to the released
 * `@denvig/cli` package.
 *
 * @module
 */
export * from '@denvig/cli'
