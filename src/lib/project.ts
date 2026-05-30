import { detectProjectWorktrees, readGitInfo } from './project/git.ts'
import { Worktree } from './project/worktree.ts'

/**
 * Truncate a project ID for display purposes.
 * Returns the first 8 characters of the ID.
 */
export function shortProjectId(id: string): string {
  return id.slice(0, 8)
}

/**
 * A project is the primary git checkout plus every detached worktree that
 * descends from it. Its identity (`id`, `slug`, `refs`, `path`, `name`) is the
 * primary checkout's.
 *
 * Everything path-sensitive (config, dependencies, actions, services) lives on
 * a {@link Worktree}. Use `activeWorktree` for the checkout a command is acting
 * on, `primaryWorktree` for the project root, or `worktree(branch)` to select a
 * specific one.
 */
export class DenvigProject {
  /** The primary checkout (`main`). Defines the project's identity. */
  readonly primaryWorktree: Worktree
  /** Every checkout: the primary plus all detached worktrees. */
  readonly worktrees: Worktree[]
  /** The checkout this project instance is acting on. */
  activeWorktree: Worktree

  private constructor(primaryWorktree: Worktree, worktrees: Worktree[]) {
    this.primaryWorktree = primaryWorktree
    this.worktrees = worktrees
    this.activeWorktree = primaryWorktree
  }

  /**
   * Retrieve a project from any path inside it (the primary checkout or a
   * detached worktree). The project's identity is rooted at the primary, and
   * the checkout matching `projectPath` becomes the active worktree.
   */
  static async retrieve(projectPath: string): Promise<DenvigProject> {
    const info = readGitInfo(projectPath)

    // Non-git path: a standalone single-checkout project.
    if (!info) {
      const only = await Worktree.retrieve(projectPath, 'main', true)
      return new DenvigProject(only, [only])
    }

    const primaryPath = info.worktree.primaryPath
    const detached = detectProjectWorktrees(projectPath)

    const [primaryWorktree, ...detachedWorktrees] = await Promise.all([
      Worktree.retrieve(primaryPath, 'main', true),
      ...detached.map((wt) => Worktree.retrieve(wt.path, wt.branch, false)),
    ])

    const worktrees = [primaryWorktree, ...detachedWorktrees]
    const project = new DenvigProject(primaryWorktree, worktrees)

    // The active worktree is the checkout the given path lives in.
    project.activeWorktree =
      worktrees.find((wt) => wt.path === projectPath) ?? primaryWorktree

    return project
  }

  /** Select a worktree by branch. `main` resolves to the primary checkout. */
  worktree(branch: string): Worktree | null {
    if (branch === 'main') return this.primaryWorktree
    return this.worktrees.find((wt) => wt.branch === branch) ?? null
  }

  /** Project identity, rooted at the primary checkout. */
  get id(): string {
    return this.primaryWorktree.id
  }

  get slug(): string {
    return this.primaryWorktree.slug
  }

  /**
   * All identifiers for the project. See `projectRefs()` for the format
   * of each ref (`id:`, `local:`, `github:`, `git:`).
   */
  get refs(): string[] {
    return this.primaryWorktree.refs
  }

  get name(): string {
    return this.primaryWorktree.name
  }

  /** Absolute path of the primary checkout. */
  get path(): string {
    return this.primaryWorktree.path
  }
}
