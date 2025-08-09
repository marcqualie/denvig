/**
 * Replaces user's home directory with `~` for display purposes.
 */
export const prettyPath = (path: string): string => {
  return path.replace(process.env.HOME || '/root', '~')
}
