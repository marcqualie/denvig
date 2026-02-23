import { DenvigProject, shortProjectId } from '../project.ts'
import { listProjects } from '../projects.ts'

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

  const projects = await listProjects()

  // ID completion mode
  if (partial.startsWith('id:')) {
    const _idPrefix = partial.slice(3)
    const completions: string[] = []
    for (const p of projects) {
      const project = await DenvigProject.retrieve(p.path)
      const shortId = shortProjectId(project.id)
      const completion = `id:${shortId}`
      if (completion.startsWith(partial)) {
        completions.push(completion)
      }
    }
    return completions
  }

  // Default: slug completion (without github: prefix)
  return projects
    .map((p) => {
      // Remove github: or local: prefix for easier typing
      return p.slug.replace(/^(github|local):/, '')
    })
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
