/**
 * Format a date as a short relative time string.
 * Examples: "1h", "3d", "4w", "2mo", "1y"
 */
export const relativeFormattedTime = (
  isoDate: string,
  now: Date = new Date(),
): string => {
  const date = new Date(isoDate)
  const diffMs = now.getTime() - date.getTime()

  if (diffMs < 0) return '0s'

  const seconds = diffMs / 1000
  const minutes = seconds / 60
  const hours = minutes / 60
  const days = hours / 24
  const weeks = days / 7
  const months = days / 30.44
  const years = days / 365.25

  if (years >= 1) return `${Math.round(years)}y`
  if (months >= 1) return `${Math.round(months)}mo`
  if (weeks >= 1) return `${Math.round(weeks)}w`
  if (days >= 1) return `${Math.round(days)}d`
  if (hours >= 1) return `${Math.round(hours)}h`
  if (minutes >= 1) return `${Math.round(minutes)}m`
  return `${Math.round(seconds)}s`
}
