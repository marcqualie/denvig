import { createHash } from 'node:crypto'

import type { DenvigProject } from './project'

type ResourceIdOptions = {
  project: DenvigProject
  workspace?: string
  resource: `action/${string}` | `service/${string}`
}

type DenvigResourceHash = {
  id: string
  hash: string
}

/**
 * Construct a unique ID for a denvig resource.
 * These IDs are used internally to identify resources uniquely across all projects, workspaces, and resources.
 */
export const constructDenvigResourceId = (options: ResourceIdOptions) => {
  const { project, workspace = 'root', resource } = options

  if (!resource.startsWith('action/') && !resource.startsWith('service/')) {
    throw new Error(
      `Invalid resource format: ${resource}. Must start with "action/" or "service/".`,
    )
  }

  return `@${project.slug}|${workspace}|${resource}`
}

/**
 * Generate a unique hash for a denvig resource.
 */
export const generateDenvigResourceHash = (
  options: ResourceIdOptions,
): DenvigResourceHash => {
  const id = constructDenvigResourceId(options)
  const hash = createHash('sha256').update(id).digest('hex')

  return {
    id,
    hash,
  }
}
