import { expandTilde } from './config.ts'
import { findDetachedWorktreeRoot, getGitHubSlug } from './project/git.ts'
import { DenvigProject } from './project.ts'
import { resolveProjectId } from './project-id.ts'
import { listProjects } from './projects.ts'

export type ResolveProjectContextOptions = {
  /** Directory to detect the project from when no `project` is given. */
  cwd: string
  /**
   * Explicit project identifier or path (e.g. `github:marcqualie/denvig` or an
   * absolute path). When provided, project detection from `cwd` is skipped.
   */
  project?: string
}

export type ProjectContext = {
  /** The resolved project, or `null` when none could be detected. */
  project: DenvigProject | null
  /** Absolute path the project was rooted at, or `null`. */
  projectPath: string | null
  /** GitHub-style slug for the project, or `null`. */
  slug: string | null
}

/**
 * Resolve the active project from an explicit identifier or by detecting it
 * from a working directory. This is the single source of truth shared by the
 * CLI entry point and the SDK so both resolve projects identically.
 *
 * Resolution order when no explicit `project` is given:
 * 1. A detached git worktree rooted at `cwd` (resolves to its own checkout).
 * 2. A configured project whose path contains `cwd`.
 * 3. `cwd` itself as a fallback.
 */
export const resolveProjectContext = async ({
  cwd,
  project: projectFlag,
}: ResolveProjectContextOptions): Promise<ProjectContext> => {
  let projectPath: string | null = null

  if (projectFlag) {
    const resolved = await resolveProjectId(projectFlag, expandTilde)
    projectPath = resolved.path
  } else {
    // A detached worktree resolves to its own checkout: `retrieve` roots the
    // project at the primary and makes this worktree the active one. This is
    // checked first so worktrees resolve even when the project glob doesn't
    // match their (possibly nested) location.
    const detachedWorktreeRoot = findDetachedWorktreeRoot(cwd)
    if (detachedWorktreeRoot) {
      projectPath = detachedWorktreeRoot
    } else {
      // Check if the directory matches any configured project path.
      const projects = await listProjects()
      const match = projects.find(
        (p) => cwd === p.path || cwd.startsWith(`${p.path}/`),
      )
      projectPath = match ? match.path : cwd
    }
  }

  const project = projectPath ? await DenvigProject.retrieve(projectPath) : null
  const slug = projectPath ? await getGitHubSlug(projectPath) : null

  return { project, projectPath, slug }
}
