import { access, readFile } from 'node:fs/promises'

/**
 * Default env files loaded for services when envFiles is not specified.
 * Files are loaded in order, with later files overriding earlier ones.
 * Missing files are silently skipped.
 */
export const DEFAULT_ENV_FILES = ['.env.development', '.env.local']

/**
 * Parse a .env file and return key-value pairs.
 *
 * Supports:
 * - Basic KEY=VALUE format
 * - Comments (lines starting with #)
 * - Empty lines
 * - Single and double quoted values
 * - Multiline values (quoted)
 *
 * @param content - Content of the .env file
 * @returns Object with environment variables
 */
export function parseEnvContent(content: string): Record<string, string> {
  const env: Record<string, string> = {}
  const lines = content.split('\n')

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim()

    // Skip empty lines and comments
    if (!line || line.startsWith('#')) {
      continue
    }

    // Find the first = sign
    const separatorIndex = line.indexOf('=')
    if (separatorIndex === -1) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    let value = line.slice(separatorIndex + 1).trim()

    // Handle quoted values - preserve # inside quotes
    const startsWithDouble = value.startsWith('"')
    const startsWithSingle = value.startsWith("'")

    if (startsWithDouble || startsWithSingle) {
      const quoteChar = startsWithDouble ? '"' : "'"
      const closingQuoteIndex = value.indexOf(quoteChar, 1)
      if (closingQuoteIndex !== -1) {
        // Extract content between quotes
        value = value.slice(1, closingQuoteIndex)
      } else {
        // No closing quote - treat as unquoted, strip comments
        const commentIndex = value.indexOf('#')
        if (commentIndex !== -1) {
          value = value.slice(0, commentIndex).trim()
        }
      }
    } else {
      // Strip inline comments from unquoted values
      const commentIndex = value.indexOf('#')
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim()
      }
    }

    if (key) {
      env[key] = value
    }
  }

  return env
}

/**
 * Read and parse a .env file.
 *
 * @param filePath - Absolute path to the .env file
 * @returns Object with environment variables
 * @throws Error if file cannot be read or parsed
 */
export async function parseEnvFile(
  filePath: string,
): Promise<Record<string, string>> {
  try {
    const content = await readFile(filePath, 'utf-8')
    return parseEnvContent(content)
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException
    if (nodeError.code === 'ENOENT') {
      throw new Error(`Environment file not found: ${filePath}`)
    }
    throw new Error(
      `Failed to read environment file: ${nodeError.message || 'Unknown error'}`,
    )
  }
}

/**
 * Load and merge multiple .env files.
 * Files are processed in order, with later files overriding earlier ones.
 *
 * @param filePaths - Array of absolute paths to .env files
 * @param options.skipMissing - If true, silently skip files that don't exist (default: false)
 * @returns Merged object with environment variables
 * @throws Error if any file cannot be read or parsed (unless skipMissing is true)
 */
export async function loadEnvFiles(
  filePaths: string[],
  options?: { skipMissing?: boolean },
): Promise<Record<string, string>> {
  const env: Record<string, string> = {}
  const skipMissing = options?.skipMissing ?? false

  for (const filePath of filePaths) {
    if (skipMissing) {
      try {
        await access(filePath)
      } catch {
        // File doesn't exist, skip it
        continue
      }
    }
    const fileEnv = await parseEnvFile(filePath)
    Object.assign(env, fileEnv)
  }

  return env
}

// Default export containing all functions
export default {
  DEFAULT_ENV_FILES,
  parseEnvContent,
  parseEnvFile,
  loadEnvFiles,
}
