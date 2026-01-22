/**
 * Options for generating a launchd plist file.
 */
export type PlistOptions = {
  label: string
  command: string
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
 * Generate a plist XML string from the given options.
 *
 * @param options - Plist configuration options
 * @returns XML string for launchd plist file
 */
export function generatePlist(options: PlistOptions): string {
  const {
    label,
    command,
    workingDirectory,
    environmentVariables = {},
    standardOutPath,
    keepAlive,
    runAtLoad,
  } = options

  // Wrap command with timestamp injection (also merges stderr into stdout)
  const wrappedCommand = wrapCommandWithTimestamp(command)

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
    <string>/bin/zsh</string>
    <string>-l</string>
    <string>-c</string>
    <string>${escapeXml(wrappedCommand)}</string>
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
  escapeXml,
  wrapCommandWithTimestamp,
}
