import type { Worktree } from '../project/worktree.ts'
import type { DenvigProject } from '../project.ts'

/**
 * Resolve a worktree branch name to the matching {@link Worktree} of a project.
 * The branch `main` always resolves to the primary checkout (matching the
 * convention used by `projectRefs`). Other branches are looked up against the
 * project's detached worktrees.
 *
 * Throws when the branch does not match any worktree (or the primary).
 */
export const resolveWorktree = (
  project: DenvigProject,
  branch: string,
): Worktree => {
  const worktree = project.worktree(branch)
  if (!worktree) {
    const available = project.worktrees
      .filter((wt) => !wt.isPrimary)
      .map((wt) => wt.branch)
    const hint = available.length
      ? ` Available worktrees: ${available.join(', ')}`
      : ''
    throw new Error(`Worktree with branch "${branch}" not found.${hint}`)
  }
  return worktree
}
