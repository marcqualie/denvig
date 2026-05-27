import { execFile } from 'node:child_process'
import {
  type Dirent,
  readdirSync,
  readFileSync,
  realpathSync,
  type Stats,
  statSync,
} from 'node:fs'
import { readFile } from 'node:fs/promises'
import path, { resolve } from 'node:path'
import { promisify } from 'node:util'

import { runInherit } from '../system/process.ts'

const execFileAsync = promisify(execFile)

/**
 * Parse a GitHub remote URL and extract owner/repo.
 * Supports:
 * - git@github.com:owner/repo.git
 * - https://github.com/owner/repo.git
 * - https://github.com/owner/repo
 */
export const parseGitHubRemoteUrl = (url: string): string | null => {
  // SSH format: git@github.com:owner/repo.git
  // Owner and repo must not contain slashes, spaces, or other invalid characters
  const sshMatch = url.match(
    /^git@github\.com:([^/\s]+)\/([^/\s]+?)(?:\.git)?$/,
  )
  if (sshMatch) {
    return `${sshMatch[1]}/${sshMatch[2]}`
  }

  // HTTPS format: https://github.com/owner/repo.git
  // Owner and repo must not contain slashes, spaces, or other invalid characters
  const httpsMatch = url.match(
    /^https:\/\/github\.com\/([^/\s]+)\/([^/\s]+?)(?:\.git)?$/,
  )
  if (httpsMatch) {
    return `${httpsMatch[1]}/${httpsMatch[2]}`
  }

  return null
}

/**
 * Get GitHub owner/repo from git remote, or null if not a GitHub repo.
 * Reads from .git/config to avoid spawning a subprocess.
 */
export const getGitHubSlug = async (
  projectPath: string,
): Promise<string | null> => {
  const gitConfigPath = path.join(projectPath, '.git', 'config')

  try {
    const gitConfig = await readFile(gitConfigPath, 'utf-8')

    // Check remotes in priority order: origin first, then github
    for (const remoteName of ['origin', 'github']) {
      const remoteMatch = gitConfig.match(
        new RegExp(`\\[remote "${remoteName}"\\][^[]*url\\s*=\\s*([^\\s\\n]+)`),
      )

      if (remoteMatch) {
        const slug = parseGitHubRemoteUrl(remoteMatch[1])
        if (slug) return slug
      }
    }

    return null
  } catch {
    return null
  }
}

/** Clone a git repository into the target directory. */
export const gitClone = (url: string, target: string): Promise<boolean> => {
  return runInherit('git', ['clone', url, target])
}

/** Run `git pull` in the given directory. */
export const gitPull = (cwd: string): Promise<boolean> => {
  return runInherit('git', ['pull'], { cwd })
}

/** Check if a git working tree has uncommitted changes. */
export const isWorkingTreeDirty = async (cwd: string): Promise<boolean> => {
  try {
    const { stdout } = await execFileAsync('git', ['status', '--porcelain'], {
      cwd,
    })
    return stdout.trim().length > 0
  } catch {
    return false
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

/**
 * Extract the `owner/repo` slug from a normalised github.com remote, or null
 * for non-github remotes.
 */
export const extractGitHubSlug = (normalised: string | null): string | null => {
  const match = normalised?.match(/^github\.com\/(.+\/.+)$/)
  return match ? match[1] : null
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

export type ProjectWorktree = {
  /** Absolute path of the detached worktree's checkout. */
  path: string
  /** Branch checked out in the detached worktree. */
  branch: string
}

/**
 * List every detached git worktree belonging to the project that `path` lives
 * in. The primary checkout is **not** included, so this returns an empty
 * array for the common single-checkout case. Returns `[]` for non-git paths
 * too.
 *
 * Results are sorted by path for deterministic output.
 */
export const detectProjectWorktrees = (path: string): ProjectWorktree[] => {
  const info = readGitInfo(resolve(path))
  if (!info) return []

  const worktreesDir = `${info.primaryGitDir}/worktrees`
  let entries: Dirent[]
  try {
    entries = readdirSync(worktreesDir, { withFileTypes: true })
  } catch {
    return []
  }

  const worktrees: ProjectWorktree[] = []
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const wtDir = `${worktreesDir}/${entry.name}`
    const branch = readHeadBranch(wtDir)
    if (!branch) continue
    let gitdirContent: string
    try {
      gitdirContent = readFileSync(`${wtDir}/gitdir`, 'utf-8').trim()
    } catch {
      continue
    }
    // `gitdir` is the absolute path to the worktree's `.git` file (or, on
    // newer git versions, sometimes the worktree directory itself). Strip a
    // trailing `/.git` to get the checkout path.
    const worktreePath = gitdirContent.replace(/\/\.git$/, '')
    worktrees.push({ path: worktreePath, branch })
  }
  return worktrees.sort((a, b) => a.path.localeCompare(b.path))
}

export type GitInfo = {
  /** Path to the primary worktree's `.git` directory. */
  primaryGitDir: string
  /** Remote URLs keyed by remote name, parsed from `.git/config`. */
  remotes: Record<string, string>
  /** Worktree details for the current path. */
  worktree: GitWorktree
}

/**
 * Read everything we need to derive project refs from a project path in one
 * pass, using only filesystem reads (no `git` subprocesses). Returns null if
 * the path is not a git working tree.
 */
export const readGitInfo = (absolutePath: string): GitInfo | null => {
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
    primaryGitDir,
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
