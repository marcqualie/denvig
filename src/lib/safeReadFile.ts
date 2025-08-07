import { readFileSync } from 'node:fs'
import { readFile } from 'node:fs/promises'

/**
 * Returns the contents of a file asynchronously if it exists, or null if it does not.
 */
export const safeReadTextFile = async (
  path: string,
): Promise<string | null> => {
  try {
    const content = await readFile(path, 'utf8')
    return content.trim() || null // Return null if the file is empty
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
}

/**
 * Returns the contents of a file synchronously if it exists, or null if it does not.
 */
export const safeReadTextFileSync = (path: string): string | null => {
  try {
    const content = readFileSync(path, 'utf8')
    return content.trim() || null // Return null if the file is empty
  } catch (error) {
    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      error.code === 'ENOENT'
    ) {
      return null
    }
    throw error
  }
}
