/**
 * `@denvig/sdk/utils` — small, dependency-free helper functions that are safe
 * for any consumer to use. Unlike `@denvig/sdk/unsafe`, nothing here reaches
 * into denvig's internal object graph; these are generic, stable utilities.
 *
 * @module
 */

export { prettyPath } from './lib/path.ts'
export {
  isDirectory,
  pathExists,
  safeReadTextFile,
} from './lib/safeReadFile.ts'
export { getSemverLevel } from './lib/semver.ts'
