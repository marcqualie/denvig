import { DenvigProject } from '../project.ts'
import { ServiceManager } from './manager.ts'

export type ServiceIdentifier = {
  projectSlug: string
  serviceName: string
}

/**
 * Parse a service identifier string into project slug and service name.
 *
 * If the identifier contains a `/`, it's treated as `project/service` format
 * where project can be multi-level (e.g., `marcqualie/api/dev` means project
 * `marcqualie/api` and service `dev`).
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

  const project =
    projectSlug === currentProject.slug
      ? currentProject
      : new DenvigProject(projectSlug)

  const manager = new ServiceManager(project)

  return { project, manager, serviceName }
}
