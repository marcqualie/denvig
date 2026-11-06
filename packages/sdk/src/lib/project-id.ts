import {
  type GitProvider,
  getGitProviders,
  gitProviderSlugSegments,
} from './project/git-providers.ts'
import { DenvigProject } from './project.ts'
import { listProjects } from './projects.ts'

/**
 * Parsed result of a project identifier.
 */
export type ParsedProjectId = {
  /**
   * Type of identifier. `slug` covers git provider slugs, with or without a
   * provider prefix.
   */
  type: 'id' | 'slug' | 'local' | 'path'
  /**
   * Git provider key for `slug` identifiers (eg. `github`), or undefined when
   * the slug was given without a prefix.
   */
  provider?: string
  /**
   * The value portion after the prefix (or the full value for unprefixed)
   */
  value: string
  /**
   * Optional service name if the identifier includes /serviceName suffix
   */
  serviceName?: string
}

/**
 * Parse a project identifier string into its components.
 *
 * Supported formats:
 * - `id:[id]` - direct ID lookup
 * - `id:[id]/[serviceName]` - ID with service
 * - `[provider]:[slug]` - git provider slug lookup (e.g., `github:owner/repo`, `git-vps:repo`)
 * - `[provider]:[slug]/[serviceName]` - git provider slug with service
 * - `local:/path/to/project` - local path lookup
 * - `local:/path/to/project/[serviceName]` - local path with service (service inferred from config)
 * - `/path/to/project` - absolute path (treated as local)
 * - `~/path/to/project` - home-relative path (treated as local)
 * - `[slug]` - matches any provider if no prefix (e.g., `owner/repo`)
 * - `[slug]/[serviceName]` - slug with service (e.g., `owner/repo/myservice`)
 */
export const parseProjectId = (
  identifier: string,
  providers: GitProvider[] = getGitProviders(),
): ParsedProjectId => {
  // Handle id:[id] or id:[id]/[serviceName]
  if (identifier.startsWith('id:')) {
    const withoutPrefix = identifier.slice(3)
    const slashIndex = withoutPrefix.indexOf('/')
    if (slashIndex === -1) {
      return { type: 'id', value: withoutPrefix }
    }
    const id = withoutPrefix.slice(0, slashIndex)
    const serviceName = withoutPrefix.slice(slashIndex + 1)
    return { type: 'id', value: id, serviceName }
  }

  // Handle [provider]:[slug] or [provider]:[slug]/[serviceName]
  const colonIndex = identifier.indexOf(':')
  const provider =
    colonIndex === -1
      ? undefined
      : providers.find((p) => p.key === identifier.slice(0, colonIndex))
  if (provider) {
    const withoutPrefix = identifier.slice(colonIndex + 1)
    const segments = gitProviderSlugSegments(provider)
    const parts = withoutPrefix.split('/')
    if (parts.length <= segments) {
      return { type: 'slug', provider: provider.key, value: withoutPrefix }
    }
    return {
      type: 'slug',
      provider: provider.key,
      value: parts.slice(0, segments).join('/'),
      serviceName: parts.slice(segments).join('/'),
    }
  }

  // Handle local:/path or local:/path/[serviceName]
  // For local paths, we need to resolve whether trailing parts are the path or a service
  if (identifier.startsWith('local:')) {
    const withoutPrefix = identifier.slice(6)
    return { type: 'local', value: withoutPrefix }
  }

  // Handle absolute paths (starting with /)
  if (identifier.startsWith('/')) {
    return { type: 'path', value: identifier }
  }

  // Handle home-relative paths (starting with ~)
  if (identifier.startsWith('~')) {
    return { type: 'path', value: identifier }
  }

  // Default: treat as an unprefixed owner/repo slug (or owner/repo/serviceName)
  const parts = identifier.split('/')
  if (parts.length <= 2) {
    return { type: 'slug', value: identifier }
  }
  const slug = `${parts[0]}/${parts[1]}`
  const serviceName = parts.slice(2).join('/')
  return { type: 'slug', value: slug, serviceName }
}

/**
 * Remove the `[provider]:` or `local:` prefix from a project slug.
 */
export const stripSlugPrefix = (slug: string): string =>
  slug.replace(/^[a-z][a-z0-9-]*:/, '')

/**
 * Resolve a parsed project identifier to a project path.
 *
 * @param parsed - The parsed project identifier
 * @param expandTilde - Function to expand ~ to home directory
 * @returns The resolved project path, or null if not found
 */
export const resolveProjectPath = async (
  parsed: ParsedProjectId,
  expandTilde: (path: string) => string,
): Promise<string | null> => {
  const projects = await listProjects()

  switch (parsed.type) {
    case 'id': {
      // Match by full ID or prefix
      for (const p of projects) {
        const project = await DenvigProject.retrieve(p.path)
        if (
          project.id === parsed.value ||
          project.id.startsWith(parsed.value)
        ) {
          return p.path
        }
      }
      return null
    }

    case 'slug': {
      const match = parsed.provider
        ? projects.find((p) => p.slug === `${parsed.provider}:${parsed.value}`)
        : projects.find((p) => stripSlugPrefix(p.slug) === parsed.value)
      return match?.path ?? null
    }

    case 'local': {
      // For local: prefix, the value is the path
      const expandedPath = expandTilde(parsed.value)
      // Verify it exists in projects list or return the path directly
      const match = projects.find((p) => p.path === expandedPath)
      if (match) {
        return match.path
      }
      // Return the expanded path even if not in projects list
      return expandedPath
    }

    case 'path': {
      // Direct path - just expand and return
      return expandTilde(parsed.value)
    }
  }
}

/**
 * Parse and resolve a project identifier to a path in one step.
 *
 * @param identifier - The project identifier string
 * @param expandTilde - Function to expand ~ to home directory
 * @returns Object with the resolved path (or null) and optional service name
 */
export const resolveProjectId = async (
  identifier: string,
  expandTilde: (path: string) => string,
): Promise<{ path: string | null; serviceName?: string }> => {
  const parsed = parseProjectId(identifier)
  const path = await resolveProjectPath(parsed, expandTilde)
  return { path, serviceName: parsed.serviceName }
}
