import { getGlobalConfigSync } from '../config.ts'

import type { GitProviderSchema } from '../../schemas/config.ts'

/**
 * A configured git provider. The `key` is the slug prefix (eg. `github` in
 * `github:owner/repo`).
 */
export type GitProvider = GitProviderSchema & {
  key: string
}

/**
 * A git remote that matched a configured provider.
 */
export type GitProviderMatch = {
  /**
   * Provider key, also the slug prefix (eg. `github`).
   */
  key: string
  type: GitProvider['type']
  name: string
  /**
   * Owner captured from the remote, or null when the template has no `{{owner}}`.
   */
  owner: string | null
  repo: string
  /**
   * Project slug, eg. `github:owner/repo` or `git-vps:repo`.
   */
  slug: string
  /**
   * Web URL of the repository, rendered from the provider's url template.
   */
  url: string
}

/**
 * Providers that are always available unless overridden in global config.
 */
export const DEFAULT_GIT_PROVIDERS: Record<string, GitProviderSchema> = {
  github: {
    type: 'github',
    url: 'https://github.com/{{owner}}/{{repo}}',
    name: 'GitHub',
  },
}

/**
 * Merge user configured providers over the defaults into an ordered list.
 */
export const resolveGitProviders = (
  configured?: Record<string, GitProviderSchema>,
): GitProvider[] =>
  Object.entries({ ...DEFAULT_GIT_PROVIDERS, ...configured }).map(
    ([key, provider]) => ({ key, ...provider }),
  )

/**
 * Load the git providers from the global config.
 */
export const getGitProviders = (): GitProvider[] =>
  resolveGitProviders(getGlobalConfigSync().gitProviders)

/**
 * Lowercase the host and drop any port from a `host[:port]/path` string so
 * ssh remotes on custom ports still match an https url template.
 */
const normaliseHost = (hostAndPath: string): string => {
  const slashIndex = hostAndPath.indexOf('/')
  const host =
    slashIndex === -1 ? hostAndPath : hostAndPath.slice(0, slashIndex)
  const rest = slashIndex === -1 ? '' : hostAndPath.slice(slashIndex)
  return `${host.replace(/:\d+$/, '').toLowerCase()}${rest}`
}

const escapeRegex = (value: string): string =>
  value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Build a matcher for normalised remotes (`host/path`) from a url template.
 */
const templateMatcher = (template: string): RegExp => {
  const withoutScheme = template
    .replace(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]+@)?/i, '')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '')
  const pattern = escapeRegex(normaliseHost(withoutScheme))
    .replace(escapeRegex('{{owner}}'), '(?<owner>.+)')
    .replace(escapeRegex('{{repo}}'), '(?<repo>[^/]+)')
  return new RegExp(`^${pattern}$`)
}

/**
 * Render a provider url template for the given owner and repo.
 */
const renderTemplate = (
  template: string,
  owner: string | null,
  repo: string,
): string =>
  template.replace('{{owner}}', owner ?? '').replace('{{repo}}', repo)

/**
 * Match a normalised remote (`host/owner/repo`, see `normaliseGitRemote()`)
 * against a provider. Returns null if the remote doesn't belong to it.
 */
export const matchGitProvider = (
  provider: GitProvider,
  normalisedRemote: string | null,
): GitProviderMatch | null => {
  if (!normalisedRemote) return null
  const match = normaliseHost(normalisedRemote).match(
    templateMatcher(provider.url),
  )
  if (!match?.groups?.repo) return null
  const owner = match.groups.owner ?? null
  const repo = match.groups.repo
  return {
    key: provider.key,
    type: provider.type,
    name: provider.name,
    owner,
    repo,
    slug: `${provider.key}:${owner ? `${owner}/${repo}` : repo}`,
    url: renderTemplate(provider.url, owner, repo),
  }
}

/**
 * Number of `/`-separated segments a slug value has for this provider
 * (`owner/repo` = 2, `repo` = 1). Used to split a trailing service name.
 */
export const gitProviderSlugSegments = (provider: GitProvider): number =>
  provider.url.includes('{{owner}}') ? 2 : 1
