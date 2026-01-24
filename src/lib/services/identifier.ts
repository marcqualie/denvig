import { DenvigProject } from '../project.ts'
import { listProjects } from '../projects.ts'
import { ServiceManager } from './manager.ts'

export type ServiceIdentifier = {
  projectSlug: string
  serviceName: string
}

/**
 * Parse a service identifier string into project slug and service name.
 *
 * If the identifier contains a `/`, it's treated as `project/service` format
 * where project can be multi-level (e.g., `marcqualie/denvig/hello` means project
 * `marcqualie/denvig` and service `hello`).
 *
 * If no `/`, uses the current project.
 */
export const parseServiceIdentifier = (
  identifier: string,
  currentProjectSlug: string,
): ServiceIdentifier => {
  if (!identifier.includes('/')) {
    return {
      projectSlug: currentProjectSlug,
      serviceName: identifier,
    }
  }

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
 * Get project and service manager for a service identifier.
 */
export const getServiceContext = (
  identifier: string,
  currentProject: DenvigProject,
): { project: DenvigProject; manager: ServiceManager; serviceName: string } => {
  const { projectSlug, serviceName } = parseServiceIdentifier(
    identifier,
    currentProject.slug,
  )

  let project: DenvigProject

  if (projectSlug === currentProject.slug) {
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
 * Other project services are returned with the slug (without prefix) for tab completion.
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
        completions.push(`${slugWithoutPrefix}/${serviceName}`)
      }
    } catch {
      // Skip projects that can't be loaded
    }
  }

  return completions
}
