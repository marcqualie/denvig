import { DenvigProject } from './project.ts'
import { listProjects } from './projects.ts'

/**
 * Parsed result of a project identifier.
 */
export type ParsedProjectId = {
  /** Type of identifier: 'id', 'github', 'local', or 'path' */
  type: 'id' | 'github' | 'local' | 'path'
  /** The value portion after the prefix (or the full value for unprefixed) */
  value: string
  /** Optional service name if the identifier includes /serviceName suffix */
  serviceName?: string
}

/**
 * Parse a project identifier string into its components.
 *
 * Supported formats:
 * - `id:[id]` - direct ID lookup
 * - `id:[id]/[serviceName]` - ID with service
 * - `github:[slug]` - GitHub slug lookup (e.g., `github:owner/repo`)
 * - `github:[slug]/[serviceName]` - GitHub slug with service
 * - `local:/path/to/project` - local path lookup
 * - `local:/path/to/project/[serviceName]` - local path with service (service inferred from config)
 * - `/path/to/project` - absolute path (treated as local)
 * - `~/path/to/project` - home-relative path (treated as local)
 * - `[slug]` - defaults to github: if no prefix (e.g., `owner/repo`)
 * - `[slug]/[serviceName]` - slug with service (e.g., `owner/repo/myservice`)
 */
export const parseProjectId = (identifier: string): ParsedProjectId => {
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

  // Handle github:[slug] or github:[slug]/[serviceName]
  if (identifier.startsWith('github:')) {
    const withoutPrefix = identifier.slice(7)
    // Slug format is owner/repo, so service would be the third slash-separated part
    const parts = withoutPrefix.split('/')
    if (parts.length <= 2) {
      return { type: 'github', value: withoutPrefix }
    }
    // owner/repo/serviceName
    const slug = `${parts[0]}/${parts[1]}`
    const serviceName = parts.slice(2).join('/')
    return { type: 'github', value: slug, serviceName }
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

  // Default: treat as github slug (owner/repo or owner/repo/serviceName)
  const parts = identifier.split('/')
  if (parts.length <= 2) {
    return { type: 'github', value: identifier }
  }
  // owner/repo/serviceName
  const slug = `${parts[0]}/${parts[1]}`
  const serviceName = parts.slice(2).join('/')
  return { type: 'github', value: slug, serviceName }
}

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

    case 'github': {
      // Try exact match with github: prefix
      const exactMatch = projects.find(
        (p) => p.slug === `github:${parsed.value}`,
      )
      if (exactMatch) {
        return exactMatch.path
      }
      return null
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
