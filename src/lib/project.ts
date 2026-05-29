import { detectProjectWorktrees, readGitInfo } from './project/git.ts'
import { Worktree } from './project/worktree.ts'

import type { ProjectConfigSchema } from '../schemas/config.ts'
import type { ConfigWithSourcePaths } from './config.ts'
import type {
  OutdatedDependencySchema,
  ProjectDependencySchema,
} from './dependencies.ts'
import type {
  DeduplicateDependenciesOptions,
  DeduplicateResult,
  OutdatedDependenciesOptions,
} from './plugin.ts'

/**
 * Truncate a project ID for display purposes.
 * Returns the first 8 characters of the ID.
 */
export function shortProjectId(id: string): string {
  return id.slice(0, 8)
}

/**
 * A project is the primary git checkout plus every detached worktree that
 * descends from it. Identity (`id`, `slug`, `refs`, `path`) is the primary
 * checkout's, while path-sensitive operations (config, dependencies, actions)
 * are delegated to the *active* worktree — the checkout the command is acting
 * on (the cwd's checkout by default, or one selected via `--worktree`).
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
      const project = new DenvigProject(only, [only])
      project.activeWorktree = only
      return project
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

  get id(): string {
    return this.activeWorktree.id
  }

  get slug(): string {
    return this.activeWorktree.slug
  }

  /**
   * All identifiers for this project. See `projectRefs()` for the format
   * of each ref (`id:`, `local:`, `github:`, `git:`).
   */
  get refs(): string[] {
    return this.activeWorktree.refs
  }

  get name(): string {
    return this.activeWorktree.name
  }

  get path(): string {
    return this.activeWorktree.path
  }

  get config(): ConfigWithSourcePaths<ProjectConfigSchema> {
    return this.activeWorktree.config
  }

  get packageManagers(): string[] {
    return this.activeWorktree.packageManagers
  }

  get primaryPackageManager(): string | null {
    return this.activeWorktree.primaryPackageManager
  }

  async dependencies(): Promise<ProjectDependencySchema[]> {
    return this.activeWorktree.dependencies()
  }

  async outdatedDependencies(
    options?: OutdatedDependenciesOptions,
  ): Promise<OutdatedDependencySchema[]> {
    return this.activeWorktree.outdatedDependencies(options)
  }

  async deduplicateDependencies(
    options?: DeduplicateDependenciesOptions,
  ): Promise<DeduplicateResult[]> {
    return this.activeWorktree.deduplicateDependencies(options)
  }

  /** Return all actions that can be run for the active worktree. */
  get actions() {
    return this.activeWorktree.actions
  }

  /** Return all services defined in the active worktree's configuration. */
  get services() {
    return this.activeWorktree.services
  }

  /** List all files in the root of the active worktree. */
  get rootFiles(): string[] {
    return this.activeWorktree.rootFiles
  }

  /** Find all files recursively with a given name in the active worktree. */
  async findFilesByName(fileName: string): Promise<string[]> {
    return this.activeWorktree.findFilesByName(fileName)
  }
}
