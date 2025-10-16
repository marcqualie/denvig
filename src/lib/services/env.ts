import { readFile } from 'node:fs/promises'

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

    // Handle quoted values
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1)
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

// Default export containing all functions
export default {
  parseEnvContent,
  parseEnvFile,
}
