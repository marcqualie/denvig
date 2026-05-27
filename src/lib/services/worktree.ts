import { readGitInfo } from '../project/git.ts'
import { DenvigProject } from '../project.ts'

/**
 * Resolve a worktree branch name to a `DenvigProject`. The branch `main`
 * always resolves to the primary checkout (matching the convention used by
 * `projectRefs`). Other branches are looked up against the project's detached
 * worktrees.
 *
 * Throws when the branch does not match any worktree (or the primary).
 */
export const resolveWorktreeProject = async (
  currentProject: DenvigProject,
  branch: string,
): Promise<DenvigProject> => {
  if (branch === 'main') {
    const info = readGitInfo(currentProject.path)
    if (info?.worktree.primaryPath) {
      return await DenvigProject.retrieve(info.worktree.primaryPath)
    }
  }

  const worktree = currentProject.worktrees.find((w) => w.branch === branch)
  if (!worktree) {
    const available = currentProject.worktrees.map((w) => w.branch)
    const hint = available.length
      ? ` Available worktrees: ${available.join(', ')}`
      : ''
    throw new Error(`Worktree with branch "${branch}" not found.${hint}`)
  }
  return await DenvigProject.retrieve(worktree.path)
}
