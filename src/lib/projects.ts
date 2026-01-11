import fs from 'node:fs'

import { getGlobalConfig } from './config.ts'

/**
 * List all projects that have a .denvig.yml configuration file.
 * Projects are detected at [codeRootDir]/[workspace]/[repo].
 *
 * @returns Array of project slugs in the format "workspace/repo"
 */
export const listProjects = (): string[] => {
  const globalConfig = getGlobalConfig()
  const codeRootDir = globalConfig.codeRootDir
  const projects: string[] = []

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
      const configPath = `${repoPath}/.denvig.yml`

      // Only include projects with a .denvig.yml file
      if (fs.existsSync(configPath)) {
        projects.push(`${workspace.name}/${repo.name}`)
      }
    }
  }

  return projects.sort()
}
