/**
 * Parse a human-readable duration string into milliseconds.
 * Supported formats: "30s", "5m", "3h", "7d", "2w"
 * Also supports plain numbers as minutes (for pnpm compatibility).
 */
export const parseDuration = (input: string): number | null => {
  // Plain number = minutes (pnpm minimumReleaseAge format)
  if (/^\d+$/.test(input)) {
    return Number.parseInt(input, 10) * 60 * 1000
  }

  const match = input.match(/^(\d+)(s|m|h|d|w)$/)
  if (!match) return null

  const value = Number.parseInt(match[1], 10)
  const unit = match[2]

  switch (unit) {
    case 's':
      return value * 1000
    case 'm':
      return value * 60 * 1000
    case 'h':
      return value * 60 * 60 * 1000
    case 'd':
      return value * 24 * 60 * 60 * 1000
    case 'w':
      return value * 7 * 24 * 60 * 60 * 1000
    default:
      return null
  }
}
