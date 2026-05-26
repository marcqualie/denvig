import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { extractGitHubSlug, normaliseGitRemote, readGitInfo } from './git.ts'

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
