/**
 * Returns the contents of a file asynchronously if it exists, or null if it does not.
 */
export const safeReadTextFile = async (
  path: string,
): Promise<string | null> => {
  try {
    const content = await Deno.readTextFile(path)
    return content.trim() || null // Return null if the file is empty
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
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
    const content = Deno.readTextFileSync(path)
    return content.trim() || null // Return null if the file is empty
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return null
    }
    throw error
  }
}
