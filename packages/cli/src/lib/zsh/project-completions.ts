import { DenvigSDK } from '@denvig/sdk'

/**
 * Get project completions based on the current input prefix.
 *
 * Completion behavior:
 * - No prefix or partial slug: returns slugs without github: prefix (e.g., `marcqualie/denvig`)
 * - `id:` prefix: returns project IDs in `id:[shortId]` format
 * - `/` or `~` prefix: returns empty (path completion not yet supported)
 */
export const getProjectCompletions = async (
  partial: string = '',
): Promise<string[]> => {
  // Path completions not yet supported
  if (partial.startsWith('/') || partial.startsWith('~')) {
    return []
  }

  const denvig = new DenvigSDK({ client: 'cli' })
  const projects = await denvig.projects.list()

  // ID completion mode
  if (partial.startsWith('id:')) {
    return projects
      .map((project) => `id:${project.id.slice(0, 8)}`)
      .filter((completion) => completion.startsWith(partial))
  }

  // Default: slug completion (without github: prefix)
  return projects
    .map((project) => project.slug.replace(/^(github|local):/, ''))
    .filter((slug) => slug.startsWith(partial))
}

/**
 * Check if we're completing a --project flag value.
 * Returns the partial value being completed, or null if not completing --project.
 */
export const getProjectFlagPartial = (words: string[]): string | null => {
  // Check for --project=value format (value might be partial or empty)
  const lastWord = words[words.length - 1] || ''
  if (lastWord.startsWith('--project=')) {
    return lastWord.slice('--project='.length)
  }

  // Check for --project value format (previous word is --project)
  if (words.length >= 2) {
    const secondToLast = words[words.length - 2]
    if (secondToLast === '--project') {
      return lastWord
    }
  }

  return null
}
