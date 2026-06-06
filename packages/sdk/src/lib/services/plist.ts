/**
 * Options for generating a launchd plist file.
 */
export type PlistOptions = {
  label: string
  programPath: string
  workingDirectory: string
  environmentVariables?: Record<string, string>
  standardOutPath: string
  keepAlive: boolean
  runAtLoad: boolean
}

/**
 * Escape special XML characters.
 *
 * @param str - String to escape
 * @returns Escaped string safe for XML
 */
export function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Wrap a command to add timestamps to each line and merge stderr into stdout.
 * Uses pure shell (zsh) for maximum compatibility with macOS.
 *
 * @param command - The original command to wrap
 * @returns The wrapped command with timestamp injection
 */
export function wrapCommandWithTimestamp(command: string): string {
  const trimmedCommand = command.trim()
  return `{ ${trimmedCommand}; } 2>&1 | while IFS= read -r line; do printf '[%s] %s\\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$line"; done`
}

/**
 * Escape a string for embedding in a single-quoted shell string.
 * Replaces ' with '\'' (end quote, escaped quote, start quote).
 */
export function escapeForSingleQuote(str: string): string {
  return str.replace(/'/g, "'\\''")
}

export type ServiceScriptOptions = {
  command: string
  serviceName: string
  projectPath: string
  projectSlug: string
  workingDirectory: string
}

/**
 * Generate a bash wrapper script that executes a command via zsh login shell.
 * This allows launchd to show the script name instead of "zsh" in Login Items.
 * Includes metadata comments so users can identify which project owns the service.
 */
export function generateServiceScript(options: ServiceScriptOptions): string {
  const wrappedCommand = wrapCommandWithTimestamp(options.command)
  return `#!/bin/bash
#
# Denvig service wrapper
# Service: ${options.serviceName}
# Project: ${options.projectSlug}
# Path:    ${options.projectPath}
# Command: ${options.command}
# Workdir: ${options.workingDirectory}
#
exec /bin/zsh -l -c '${escapeForSingleQuote(wrappedCommand)}'
`
}

/**
 * Generate a plist XML string from the given options.
 *
 * @param options - Plist configuration options
 * @returns XML string for launchd plist file
 */
export function generatePlist(options: PlistOptions): string {
  const {
    label,
    programPath,
    workingDirectory,
    environmentVariables = {},
    standardOutPath,
    keepAlive,
    runAtLoad,
  } = options

  // Build environment variables section
  const envVarsXml = Object.entries(environmentVariables)
    .map(
      ([key, value]) => `    <key>${escapeXml(key)}</key>
    <string>${escapeXml(value)}</string>`,
    )
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${escapeXml(label)}</string>

  <key>ProgramArguments</key>
  <array>
    <string>${escapeXml(programPath)}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${escapeXml(workingDirectory)}</string>

  <key>EnvironmentVariables</key>
  <dict>
${envVarsXml}
  </dict>

  <key>StandardOutPath</key>
  <string>${escapeXml(standardOutPath)}</string>

  <key>KeepAlive</key>
  <${keepAlive ? 'true' : 'false'}/>

  <key>RunAtLoad</key>
  <${runAtLoad ? 'true' : 'false'}/>
</dict>
</plist>
`
}

// Default export containing all functions
export default {
  generatePlist,
  generateServiceScript,
  escapeXml,
  escapeForSingleQuote,
  wrapCommandWithTimestamp,
}
