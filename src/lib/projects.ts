import fs from 'node:fs'

import { getGlobalConfig } from './config.ts'

export type ListProjectsOptions = {
  /** Only include projects with a .denvig.yml configuration file */
  withConfig?: boolean
}

/**
 * List all projects in the codeRootDir.
 * Projects are detected at [codeRootDir]/[workspace]/[repo].
 *
 * @param options - Optional filters for project listing
 * @returns Array of project slugs in the format "workspace/repo"
 */
export const listProjects = (options?: ListProjectsOptions): string[] => {
  const globalConfig = getGlobalConfig()
  const codeRootDir = globalConfig.codeRootDir
  const projects: string[] = []
  const withConfig = options?.withConfig ?? false

  // Check if codeRootDir exists
  if (!fs.existsSync(codeRootDir)) {
    return projects
  }

  // Get all workspace directories
  const workspaces = fs.readdirSync(codeRootDir, { withFileTypes: true })

  for (const workspace of workspaces) {
    if (!workspace.isDirectory()) continue
    if (workspace.name.startsWith('.')) continue

    const workspacePath = `${codeRootDir}/${workspace.name}`

    // Get all repo directories within the workspace
    const repos = fs.readdirSync(workspacePath, { withFileTypes: true })

    for (const repo of repos) {
      if (!repo.isDirectory()) continue
      if (repo.name.startsWith('.')) continue

      const repoPath = `${workspacePath}/${repo.name}`

      if (withConfig) {
        const configPath = `${repoPath}/.denvig.yml`
        if (!fs.existsSync(configPath)) {
          continue
        }
      }

      projects.push(`${workspace.name}/${repo.name}`)
    }
  }

  return projects.sort()
}
