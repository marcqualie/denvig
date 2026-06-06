/**
 * `@denvig/sdk/fs` — small, dependency-free filesystem helpers that are safe
 * for any consumer to use without instantiating the SDK. These are generic,
 * stable utilities that read from or inspect the filesystem.
 *
 * @module
 */

export {
  isDirectory,
  pathExists,
  safeReadTextFile,
} from './lib/safeReadFile.ts'
