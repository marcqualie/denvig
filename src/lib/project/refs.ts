import { execSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * Calculate a bunch of project refs based on it's config and environment.
 *
 * Refs starting with `id:` or `local:` uniquely identify a single project /
 * worktree on this machine. The `github:` ref is shared across sibling
 * clones and worktrees so it can be used for group actions. The `git:` ref
 * is `<host>/<owner>/<repo>+<branch>` (eg. `git:github.com/marcqualie/denvig+main`),
 * giving each worktree a unique address while sharing a common prefix per
 * project. The primary checkout always reports `+main`; only detached
 * worktrees report their actual branch name.
 */
export const projectRefs = (path: string): string[] => {
  const refs: string[] = []
  const absolutePath = resolve(path)
  const gitRemote = retrieveGitRemote(absolutePath)
  const normalisedRemote = gitRemote ? normaliseGitRemote(gitRemote) : null
  const gitWorktree = detectGitWorktree(absolutePath)

  // GitHub group ref - shared across every clone and worktree of the same repo.
  const githubMatch = normalisedRemote?.match(/^github\.com\/(.+\/.+)$/)
  if (githubMatch) {
    refs.push(`github:${githubMatch[1]}`)
  }

  // Worktree-aware git ref: `git:<host>/<owner>/<repo>+<branch>`. Sibling
  // worktrees share the prefix up to `+` so they can be grouped while still
  // being uniquely addressable.
  if (normalisedRemote && gitWorktree) {
    refs.push(`git:${normalisedRemote}+${gitWorktree.branch}`)
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

/**
 * Normalise a git remote URL into `<host>/<owner>/<repo>` form. Supports the
 * three common shapes: scp-style ssh (`git@host:owner/repo.git`), explicit
 * ssh URLs (`ssh://git@host/owner/repo.git`) and http(s) URLs. Returns null
 * for anything that doesn't parse cleanly.
 */
export const normaliseGitRemote = (remote: string): string | null => {
  const stripped = remote.replace(/\.git$/, '')

  // http(s):// or ssh:// or git://
  const urlMatch = stripped.match(
    /^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?([^/]+)\/(.+)$/i,
  )
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}`
  }

  // scp-style ssh: `[user@]host:path`
  const scpMatch = stripped.match(/^(?:[^@\s/]+@)?([^:\s/]+):(.+)$/)
  if (scpMatch) {
    return `${scpMatch[1]}/${scpMatch[2]}`
  }

  return null
}

export type GitWorktree = {
  /** Real path of the primary worktree (shared across all sibling worktrees). */
  primaryPath: string
  /** Branch name for the current worktree (`main` for the primary checkout). */
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
