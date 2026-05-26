import { createHash } from 'node:crypto'
import { readFileSync, realpathSync, type Stats, statSync } from 'node:fs'
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
  const info = readGitInfo(absolutePath)

  const originRemote = info?.remotes.origin ?? null
  const normalisedOrigin = originRemote
    ? normaliseGitRemote(originRemote)
    : null

  // GitHub group ref - shared across every clone and worktree of the same repo.
  // Prefer the origin remote, but fall back to a dedicated `github` remote (a
  // common pattern when `origin` points at a mirror like Gitea).
  const githubRemote = info?.remotes.github ?? null
  const githubSlug =
    extractGitHubSlug(normalisedOrigin) ??
    extractGitHubSlug(githubRemote ? normaliseGitRemote(githubRemote) : null)
  if (githubSlug) {
    refs.push(`github:${githubSlug}`)
  }

  // Worktree-aware git ref: `git:<host>/<owner>/<repo>+<branch>`. Sibling
  // worktrees share the prefix up to `+` so they can be grouped while still
  // being uniquely addressable.
  if (normalisedOrigin && info?.worktree) {
    refs.push(`git:${normalisedOrigin}+${info.worktree.branch}`)
  }

  // Always include a local ref to the project path
  refs.push(`local:${absolutePath}`)

  // The ID is a sha1 of all the other refs - stable, derivable from public
  // state, and unique per worktree.
  const id = createHash('sha1').update(refs.join('\n')).digest('hex')
  refs.push(`id:${id}`)

  return refs
}

const extractGitHubSlug = (normalised: string | null): string | null => {
  const match = normalised?.match(/^github\.com\/(.+\/.+)$/)
  return match ? match[1] : null
}

/**
 * Slug for a project path, derived from `projectRefs()`. Returns the
 * `github:<owner>/<repo>` ref when present, otherwise the `local:<path>` ref.
 */
export const projectSlug = (path: string): string => {
  const refs = projectRefs(path)
  const github = refs.find((ref) => ref.startsWith('github:'))
  if (github) return github
  // `local:` is always emitted by projectRefs.
  return refs.find((ref) => ref.startsWith('local:')) as string
}

/**
 * Project ID for a path, derived from `projectRefs()`. This is the hash
 * portion of the `id:` ref.
 */
export const projectId = (path: string): string => {
  const refs = projectRefs(path)
  const idRef = refs.find((ref) => ref.startsWith('id:')) as string
  return idRef.slice('id:'.length)
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
  return readGitInfo(resolve(path))?.worktree ?? null
}

type GitInfo = {
  /** Remote URLs keyed by remote name, parsed from `.git/config`. */
  remotes: Record<string, string>
  /** Worktree details, or null if the path isn't a git worktree. */
  worktree: GitWorktree | null
}

/**
 * Read everything we need to derive project refs from a project path in one
 * pass, using only filesystem reads (no `git` subprocesses). Returns null if
 * the path is not a git working tree.
 */
const readGitInfo = (absolutePath: string): GitInfo | null => {
  const gitMarker = resolve(absolutePath, '.git')
  let markerStat: Stats
  try {
    markerStat = statSync(gitMarker)
  } catch {
    return null
  }

  let primaryGitDir: string
  let worktree: GitWorktree

  if (markerStat.isFile()) {
    // Detached worktree. `.git` is a file pointing at the worktree-specific
    // gitdir: `gitdir: <primary>/.git/worktrees/<name>`.
    let content: string
    try {
      content = readFileSync(gitMarker, 'utf-8').trim()
    } catch {
      return null
    }
    const match = content.match(/^gitdir:\s*(.+)\/\.git\/worktrees\/([^/]+)$/)
    if (!match) return null
    const primaryPath = match[1]
    const worktreeGitDir = `${primaryPath}/.git/worktrees/${match[2]}`
    primaryGitDir = `${primaryPath}/.git`

    // Branch comes from the worktree's HEAD ref.
    const branch = readHeadBranch(worktreeGitDir)
    if (!branch) return null
    worktree = { primaryPath, branch }
  } else if (markerStat.isDirectory()) {
    // Primary worktree. Always reports `main` for the branch so the primary's
    // ref stays stable as work moves between branches.
    let primaryPath: string
    try {
      primaryPath = realpathSync(absolutePath)
    } catch {
      primaryPath = absolutePath
    }
    primaryGitDir = gitMarker
    worktree = { primaryPath, branch: 'main' }
  } else {
    return null
  }

  return {
    remotes: readRemotes(`${primaryGitDir}/config`),
    worktree,
  }
}

/** Read `<gitdir>/HEAD` and return the branch name, or null. */
const readHeadBranch = (gitDir: string): string | null => {
  try {
    const head = readFileSync(`${gitDir}/HEAD`, 'utf-8').trim()
    const match = head.match(/^ref:\s*refs\/heads\/(.+)$/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Parse remote URLs from a `.git/config` file. Returns a map of remote name
 * to URL. Missing or unreadable configs yield an empty map.
 */
const readRemotes = (configPath: string): Record<string, string> => {
  const remotes: Record<string, string> = {}
  let config: string
  try {
    config = readFileSync(configPath, 'utf-8')
  } catch {
    return remotes
  }
  // Match `[remote "<name>"]` headers and the first `url = <value>` line that
  // follows before the next section header.
  const re = /\[remote\s+"([^"]+)"\][^[]*?url\s*=\s*(\S+)/g
  for (const match of config.matchAll(re)) {
    if (!(match[1] in remotes)) {
      remotes[match[1]] = match[2]
    }
  }
  return remotes
}

/**
 * Legacy compatibility helper. Returns the URL of a named git remote (default
 * `origin`) parsed from `.git/config`. Returns null when the path is not a
 * git repository or the remote isn't defined.
 */
export const retrieveGitRemote = (
  path: string,
  remoteName = 'origin',
): string | null => {
  const info = readGitInfo(resolve(path))
  return info?.remotes[remoteName] ?? null
}
