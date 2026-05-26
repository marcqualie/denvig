import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Calculate a bunch of project refs based on it's config and environment.
 *
 * Refs starting with `id:` or `local:` uniquely identify a single project /
 * worktree on this machine. Refs like `github:` and `git:` are shared across
 * sibling clones and worktrees so they can be used for group actions. The
 * `git-worktree:` ref is `<primary-worktree-path>+<branch>` so detached
 * worktrees share a common path prefix with their primary checkout while
 * remaining individually addressable.
 */
export const projectRefs = (path: string): string[] => {
  const refs: string[] = []
  const absolutePath = resolve(path)
  const gitRemote = retrieveGitRemote(absolutePath)

  // If there's a git remote, add a ref for it. If it's a GitHub remote, add a github: ref.
  const githubMatch = gitRemote?.match(/github\.com[:/](.+\/.+?)(?:\.git)?$/)
  const githubSlug = githubMatch ? githubMatch[1] : null
  if (githubSlug) {
    refs.push(`github:${githubSlug}`)
  } else if (gitRemote) {
    refs.push(`git:${gitRemote}`)
  }

  // Git worktree detection. Format is `<primary-path>+<branch>` so the primary
  // checkout and any detached worktrees share a common path prefix.
  const gitWorktree = detectGitWorktree(absolutePath)
  if (gitWorktree) {
    refs.push(`git-worktree:${gitWorktree.primaryPath}+${gitWorktree.branch}`)
  }

  // Always include a local ref to the project path
  refs.push(`local:${absolutePath}`)

  // The ID is made up of the physical and git configs to get a unique hash
  const config = {
    path: absolutePath,
    gitRemote,
    gitWorktree,
  }
  const id = createHash('sha1').update(JSON.stringify(config)).digest('hex')
  refs.push(`id:${id}`)

  return refs
}

export const retrieveGitRemote = (path: string): string | null => {
  try {
    const absolutePath = resolve(path)
    const gitRemote = execSync('git remote get-url origin', {
      cwd: absolutePath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return gitRemote || null
  } catch {
    return null
  }
}

export type GitWorktree = {
  /** Real path of the primary worktree (shared across all sibling worktrees). */
  primaryPath: string
  /** Branch name checked out in the current worktree. */
  branch: string
}

/**
 * Detect the git worktree the given path lives in. Returns the primary
 * worktree path (same for the primary checkout and every detached worktree
 * that descends from it) and the branch name of the current worktree.
 *
 * The primary worktree always reports `main` as its branch (regardless of
 * which branch is checked out) so the primary's ref stays stable as work
 * moves between branches. Only detached worktrees report the checked-out
 * branch name.
 */
export const detectGitWorktree = (path: string): GitWorktree | null => {
  try {
    const absolutePath = resolve(path)

    // A detached worktree has a `.git` *file* containing `gitdir: <primary>/.git/worktrees/<name>`.
    const gitMarker = resolve(absolutePath, '.git')
    if (existsSync(gitMarker) && statSync(gitMarker).isFile()) {
      const content = readFileSync(gitMarker, 'utf-8').trim()
      const match = content.match(/^gitdir:\s*(.+)\/\.git\/worktrees\/[^/]+$/)
      if (match) {
        const branch = execSync('git branch --show-current', {
          cwd: absolutePath,
          encoding: 'utf-8',
          stdio: ['ignore', 'pipe', 'ignore'],
        }).trim()
        if (!branch) return null
        return { primaryPath: match[1], branch }
      }
    }

    // Primary worktree - normalise via realpath so symlinked paths (eg. /tmp on macOS)
    // match the realpath stored inside detached worktree `.git` files. Confirm
    // this is actually a git working tree before claiming a worktree ref.
    if (!existsSync(gitMarker)) return null
    execSync('git rev-parse --git-dir', {
      cwd: absolutePath,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
    return { primaryPath: realpathSync(absolutePath), branch: 'main' }
  } catch {
    return null
  }
}
