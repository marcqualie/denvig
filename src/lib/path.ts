/**
 * Replaces user's home directory with `~` for display purposes.
 */
export const prettyPath = (path: string): string => {
  return path.replace(Deno.env.get('HOME') || '/root', '~')
}
