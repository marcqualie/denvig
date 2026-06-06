import { DenvigProject } from '../lib/project.ts'
import { getProjectInfo } from '../lib/projectInfo.ts'
import { listProjects } from '../lib/projects.ts'

import type { ProjectResponse } from '../types/responses.ts'

export type ListProjectsOptions = {
  /** Only include projects with a `.denvig.yml` configuration file. */
  withConfig?: boolean
}

/**
 * Group listed project paths into families keyed by primary checkout, so each
 * project appears once regardless of how many of its checkouts the glob matched.
 */
export const groupIntoFamilies = async (
  paths: string[],
): Promise<DenvigProject[]> => {
  const families = new Map<string, DenvigProject>()
  for (const path of paths) {
    const project = await DenvigProject.retrieve(path)
    const key = project.primaryWorktree.path
    if (!families.has(key)) {
      project.activeWorktree = project.primaryWorktree
      families.set(key, project)
    }
  }
  return [...families.values()].sort((a, b) =>
    a.primaryWorktree.path.localeCompare(b.primaryWorktree.path),
  )
}

/**
 * List all projects on the system as data (one entry per project family).
 * Service status is omitted for performance, matching the CLI's JSON output.
 */
export const listProjectsInfo = async (
  options: ListProjectsOptions = {},
): Promise<ProjectResponse[]> => {
  const projectPaths = await listProjects({ withConfig: !!options.withConfig })
  const families = await groupIntoFamilies(projectPaths.map((p) => p.path))

  const projects: ProjectResponse[] = []
  for (const family of families) {
    const info = await getProjectInfo(family, { includeServiceStatus: false })
    const { serviceStatus: _serviceStatus, ...infoWithoutStatus } = info
    projects.push(infoWithoutStatus)
  }
  return projects
}
