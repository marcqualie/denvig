import { readFile } from 'node:fs/promises'
import path from 'node:path'

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

    // Parse git config to find remotes
    // Look for [remote "origin"] section and its url
    const remoteOriginMatch = gitConfig.match(
      /\[remote "origin"\][^[]*url\s*=\s*([^\s\n]+)/,
    )

    if (remoteOriginMatch) {
      const remoteUrl = remoteOriginMatch[1]
      return parseGitHubRemoteUrl(remoteUrl)
    }

    return null
  } catch {
    return null
  }
}

/**
 * Generate the full slug for a project path.
 * Returns 'github:owner/repo' for GitHub projects, 'local:/absolute/path' otherwise.
 */
export const getProjectSlug = async (projectPath: string): Promise<string> => {
  const githubSlug = await getGitHubSlug(projectPath)
  if (githubSlug) {
    return `github:${githubSlug}`
  }
  return `local:${projectPath}`
}
