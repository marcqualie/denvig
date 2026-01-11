/**
 * Options for generating a launchd plist file.
 */
export interface PlistOptions {
  label: string
  command: string
  workingDirectory: string
  environmentVariables?: Record<string, string>
  standardOutPath: string
  standardErrorPath: string
  keepAlive: boolean
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
    standardErrorPath,
    keepAlive,
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
    <string>/bin/zsh</string>
    <string>-l</string>
    <string>-c</string>
    <string>${escapeXml(command.trim())}</string>
  </array>

  <key>WorkingDirectory</key>
  <string>${escapeXml(workingDirectory)}</string>

  <key>EnvironmentVariables</key>
  <dict>
${envVarsXml}
  </dict>

  <key>StandardOutPath</key>
  <string>${escapeXml(standardOutPath)}</string>

  <key>StandardErrorPath</key>
  <string>${escapeXml(standardErrorPath)}</string>

  <key>KeepAlive</key>
  <${keepAlive ? 'true' : 'false'}/>

  <key>RunAtLoad</key>
  <false/>
</dict>
</plist>
`
}

// Default export containing all functions
export default {
  generatePlist,
  escapeXml,
}
