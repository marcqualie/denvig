import { createHash } from 'node:crypto'
import { resolve } from 'node:path'

import { normaliseGitRemote, readGitInfo } from './git.ts'
import {
  type GitProvider,
  type GitProviderMatch,
  getGitProviders,
  matchGitProvider,
} from './git-providers.ts'

/**
 * Everything derived from a project path's git state and the configured git
 * providers.
 */
export type ProjectIdentity = {
  /**
   * All refs, see `projectRefs()`.
   */
  refs: string[]
  /**
   * Primary git provider ref when present, otherwise the `local:` ref.
   */
  slug: string
  /**
   * SHA1 hash identifying this checkout.
   */
  id: string
  /**
   * The git provider the slug was derived from, or null.
   */
  gitProvider: GitProviderMatch | null
}

/**
 * Ref prefixes that existed before configurable git providers. The id is
 * hashed from these only, so adding a provider never changes existing ids
 * (which key service state and launchd labels).
 */
const ID_REF_PREFIXES = ['github:', 'git:', 'local:']

/**
 * Find every provider that matches the project. A provider matches the
 * `origin` remote, or a remote named after the provider key (eg. a `github`
 * remote alongside an `origin` that points at a Gitea mirror). Providers that
 * match `origin` come first.
 */
const matchGitProviders = (
  remotes: Record<string, string>,
  providers: GitProvider[],
): GitProviderMatch[] => {
  const normalise = (remote: string | undefined) =>
    remote ? normaliseGitRemote(remote) : null
  const origin = normalise(remotes.origin)
  const fromOrigin: GitProviderMatch[] = []
  const fromNamedRemote: GitProviderMatch[] = []
  for (const provider of providers) {
    const originMatch = matchGitProvider(provider, origin)
    if (originMatch) {
      fromOrigin.push(originMatch)
      continue
    }
    const namedMatch = matchGitProvider(
      provider,
      normalise(remotes[provider.key]),
    )
    if (namedMatch) fromNamedRemote.push(namedMatch)
  }
  return [...fromOrigin, ...fromNamedRemote]
}

/**
 * Derive refs, slug, id and git provider for a project path.
 */
export const projectIdentity = (
  path: string,
  providers: GitProvider[] = getGitProviders(),
): ProjectIdentity => {
  const refs: string[] = []
  const absolutePath = resolve(path)
  const info = readGitInfo(absolutePath)

  // Provider group refs (eg. `github:owner/repo`) - shared across every clone
  // and worktree of the same repo.
  const matches = info ? matchGitProviders(info.remotes, providers) : []
  for (const match of matches) {
    refs.push(match.slug)
  }

  // Worktree-aware git ref: `git:<host>/<owner>/<repo>+<branch>`. Sibling
  // worktrees share the prefix up to `+` so they can be grouped while still
  // being uniquely addressable.
  const originRemote = info?.remotes.origin ?? null
  const normalisedOrigin = originRemote
    ? normaliseGitRemote(originRemote)
    : null
  if (normalisedOrigin && info?.worktree) {
    refs.push(`git:${normalisedOrigin}+${info.worktree.branch}`)
  }

  // Always include a local ref to the project path
  const localRef = `local:${absolutePath}`
  refs.push(localRef)

  const idInput = refs.filter((ref) =>
    ID_REF_PREFIXES.some((prefix) => ref.startsWith(prefix)),
  )
  const id = createHash('sha1').update(idInput.join('\n')).digest('hex')
  refs.push(`id:${id}`)

  const gitProvider = matches[0] ?? null
  return { refs, slug: gitProvider?.slug ?? localRef, id, gitProvider }
}

/**
 * Calculate a bunch of project refs based on it's config and environment.
 *
 * Refs starting with `id:` or `local:` uniquely identify a single project /
 * worktree on this machine. Git provider refs (eg. `github:owner/repo` or
 * `gitea-mqn:owner/repo`) are shared across sibling clones and worktrees so
 * they can be used for group actions. The `git:` ref is
 * `<host>/<owner>/<repo>+<branch>` (eg. `git:github.com/marcqualie/denvig+main`),
 * giving each worktree a unique address while sharing a common prefix per
 * project. The primary checkout always reports `+main`; only detached
 * worktrees report their actual branch name.
 */
export const projectRefs = (
  path: string,
  providers?: GitProvider[],
): string[] => projectIdentity(path, providers).refs

/**
 * Slug for a project path. Returns the first git provider ref when present
 * (eg. `github:<owner>/<repo>`), otherwise the `local:<path>` ref.
 */
export const projectSlug = (path: string, providers?: GitProvider[]): string =>
  projectIdentity(path, providers).slug

/**
 * Project ID for a path. This is the hash portion of the `id:` ref.
 */
export const projectId = (path: string, providers?: GitProvider[]): string =>
  projectIdentity(path, providers).id
