import { access, readFile, stat } from 'node:fs/promises'

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
 * Check if a path exists on the filesystem.
 */
export const pathExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

/**
 * Check if a path is a directory.
 */
export const isDirectory = async (path: string): Promise<boolean> => {
  try {
    const stats = await stat(path)
    return stats.isDirectory()
  } catch {
    return false
  }
}
