import { DenvigProject, shortProjectId } from '../project.ts'
import { listProjects } from '../projects.ts'

/**
 * Get project completions based on the current input prefix.
 *
 * Completion behavior:
 * - No prefix or partial slug: returns slugs without github: prefix (e.g., `marcqualie/denvig`)
 * - `id:` prefix: returns project IDs in `id:[shortId]` format
 * - `/` or `~` prefix: returns empty array (signals zsh to use file completion)
 */
export const getProjectCompletions = (partial: string = ''): string[] => {
  // For path completions, return empty to let zsh handle file completion
  if (partial.startsWith('/') || partial.startsWith('~')) {
    return []
  }

  const projects = listProjects()

  // ID completion mode
  if (partial.startsWith('id:')) {
    const idPrefix = partial.slice(3)
    return projects
      .map((p) => {
        const project = new DenvigProject(p.path)
        const shortId = shortProjectId(project.id)
        return `id:${shortId}`
      })
      .filter((completion) => completion.startsWith(partial))
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
