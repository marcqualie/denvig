/**
 * `@denvig/sdk/utils` — small, dependency-free helper functions that are safe
 * for any consumer to use. Unlike `@denvig/sdk/unsafe`, nothing here reaches
 * into denvig's internal object graph; these are generic, stable utilities.
 *
 * Filesystem actions (reading files, checking paths) live on the SDK's `fs`
 * namespace instead — e.g. `denvig.fs.safeReadTextFile(path)`.
 *
 * @module
 */

export { prettyPath } from './lib/path.ts'
export { getSemverLevel } from './lib/semver.ts'
