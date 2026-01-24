import { expandTilde } from '../config.ts'
import { DenvigProject, shortProjectId } from '../project.ts'
import { parseProjectId, resolveProjectPath } from '../project-id.ts'
import { listProjects } from '../projects.ts'
import { ServiceManager } from './manager.ts'

export type ServiceIdentifier = {
  projectSlug: string
  projectId?: string
  serviceName: string
}

/**
 * Parse a service identifier string into project slug/id and service name.
 *
 * Supported formats:
 * - `serviceName` - uses the current project
 * - `id:[id]/[serviceName]` - ID lookup (e.g., `id:a1b2c3d4/hello`)
 * - `github:[slug]/[serviceName]` - GitHub slug (e.g., `github:owner/repo/hello`)
 * - `local:/path/to/project` - local path (service name extracted from path if exists)
 * - `[slug]/[serviceName]` - unprefixed slug (e.g., `marcqualie/denvig/hello`)
 */
export const parseServiceIdentifier = (
  identifier: string,
  currentProjectSlug: string,
): ServiceIdentifier => {
  // If no slash, it's just a service name in the current project
  if (!identifier.includes('/')) {
    return {
      projectSlug: currentProjectSlug,
      serviceName: identifier,
    }
  }

  // Use the unified project ID parser
  const parsed = parseProjectId(identifier)

  // If the parser found a service name, use it
  if (parsed.serviceName !== undefined) {
    if (parsed.type === 'id') {
      return {
        projectSlug: '',
        projectId: parsed.value,
        serviceName: parsed.serviceName,
      }
    }

    // For github/local types, construct the slug
    const slug =
      parsed.type === 'local'
        ? `local:${parsed.value}`
        : `github:${parsed.value}`
    return {
      projectSlug: slug,
      serviceName: parsed.serviceName,
    }
  }

  // For paths and local without explicit service, the identifier is ambiguous
  // Fall back to the old behavior: last part is service name
  if (parsed.type === 'path' || parsed.type === 'local') {
    // For absolute paths, we can't easily distinguish between path and service
    // Return the whole thing as the slug, let getServiceContext handle it
    return {
      projectSlug:
        parsed.type === 'local' ? `local:${parsed.value}` : parsed.value,
      serviceName: '',
    }
  }

  // For github slugs without explicit service name, fall back to old behavior
  // Split by `/` and the last part is the service name
  const parts = identifier.split('/')
  const serviceName = parts.pop() as string
  const projectSlug = parts.join('/')

  return {
    projectSlug,
    serviceName,
  }
}

/**
 * Resolve a project slug to a path by looking it up in the list of known projects.
 * Handles both full slugs (e.g., `github:marcqualie/denvig`) and short slugs
 * without the prefix (e.g., `marcqualie/denvig`).
 *
 * @returns The project path, or null if not found
 */
export const resolveProjectSlugToPath = (slug: string): string | null => {
  const projects = listProjects({ withConfig: true })

  // Try exact match first
  const exactMatch = projects.find((p) => p.slug === slug)
  if (exactMatch) {
    return exactMatch.path
  }

  // Try matching without prefix (e.g., `marcqualie/denvig` matches `github:marcqualie/denvig`)
  const prefixedMatch = projects.find((p) => {
    const slugWithoutPrefix = p.slug.replace(/^(github|local):/, '')
    return slugWithoutPrefix === slug
  })
  if (prefixedMatch) {
    return prefixedMatch.path
  }

  return null
}

/**
 * Resolve a project ID to a path by looking it up in the list of known projects.
 * Supports both full IDs and short IDs (prefix matching).
 *
 * @returns The project path, or null if not found
 */
export const resolveProjectIdToPath = (id: string): string | null => {
  const projects = listProjects({ withConfig: true })

  for (const p of projects) {
    const project = new DenvigProject(p.path)
    // Match full ID or short ID prefix
    if (project.id === id || project.id.startsWith(id)) {
      return p.path
    }
  }

  return null
}

/**
 * Get project and service manager for a service identifier.
 */
export const getServiceContext = (
  identifier: string,
  currentProject: DenvigProject,
): { project: DenvigProject; manager: ServiceManager; serviceName: string } => {
  // Try using the unified project ID resolver first
  const parsed = parseProjectId(identifier)

  // If the identifier has a service name from parsing
  if (parsed.serviceName !== undefined && parsed.serviceName !== '') {
    const projectPath = resolveProjectPath(parsed, expandTilde)
    if (projectPath) {
      const project = new DenvigProject(projectPath)
      const manager = new ServiceManager(project)
      return { project, manager, serviceName: parsed.serviceName }
    }
  }

  // Fall back to the service identifier parsing for backwards compatibility
  const { projectSlug, projectId, serviceName } = parseServiceIdentifier(
    identifier,
    currentProject.slug,
  )

  let project: DenvigProject

  // Handle project ID lookup first (supports both full and short IDs)
  if (projectId) {
    if (
      currentProject.id === projectId ||
      currentProject.id.startsWith(projectId)
    ) {
      project = currentProject
    } else {
      const projectPath = resolveProjectIdToPath(projectId)
      if (projectPath) {
        project = new DenvigProject(projectPath)
      } else {
        throw new Error(`Project with ID "${projectId}" not found`)
      }
    }
  } else if (projectSlug === currentProject.slug) {
    project = currentProject
  } else {
    // Try to resolve the slug to a path
    const projectPath = resolveProjectSlugToPath(projectSlug)
    if (projectPath) {
      project = new DenvigProject(projectPath)
    } else {
      // Fallback: treat as path (original behavior)
      project = new DenvigProject(projectSlug)
    }
  }

  const manager = new ServiceManager(project)

  return { project, manager, serviceName }
}

/**
 * Get completions for service names, including services from other projects.
 * Current project services are returned without a prefix.
 * Other project services are returned with both slug and id formats for tab completion.
 */
export const getServiceCompletions = (
  currentProject: DenvigProject,
): string[] => {
  const completions: string[] = []

  // Add current project services (without prefix)
  for (const serviceName of Object.keys(currentProject.services)) {
    completions.push(serviceName)
  }

  // Add services from other projects
  const projects = listProjects({ withConfig: true })
  for (const projectInfo of projects) {
    // Skip the current project
    if (projectInfo.slug === currentProject.slug) {
      continue
    }

    try {
      const otherProject = new DenvigProject(projectInfo.path)
      const slugWithoutPrefix = projectInfo.slug.replace(/^(github|local):/, '')

      for (const serviceName of Object.keys(otherProject.services)) {
        // Add slug-based completion
        completions.push(`${slugWithoutPrefix}/${serviceName}`)
        // Add id-based completion for exact matching (useful for worktrees)
        completions.push(`id:${shortProjectId(otherProject.id)}/${serviceName}`)
      }
    } catch {
      // Skip projects that can't be loaded
    }
  }

  return completions
}
