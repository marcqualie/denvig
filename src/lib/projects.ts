import { readdir } from 'node:fs/promises'

import { expandTilde, getGlobalConfig } from './config.ts'
import { getProjectSlug } from './git.ts'
import { isDirectory, pathExists } from './safeReadFile.ts'

export type ProjectInfo = {
  slug: string
  path: string
}

export type ListProjectsOptions = {
  /** Only include projects with a .denvig.yml configuration file */
  withConfig?: boolean
}

/**
 * Expand a path pattern containing * wildcards into matching directories.
 * Each * matches a single directory level (not recursive).
 */
const expandPattern = async (pattern: string): Promise<string[]> => {
  const expandedPattern = expandTilde(pattern)
  const parts = expandedPattern.split('/')
  let paths = ['']

  for (const part of parts) {
    if (part === '') {
      // Handle leading slash
      paths = paths.map((p) => `${p}/`)
      continue
    }

    if (part === '*') {
      // Expand wildcard: for each current path, list directories
      const newPaths: string[] = []
      for (const basePath of paths) {
        const fullPath = basePath || '/'
        if (!(await pathExists(fullPath))) continue

        try {
          const entries = await readdir(fullPath, { withFileTypes: true })
          for (const entry of entries) {
            if (!entry.isDirectory()) continue
            if (entry.name.startsWith('.')) continue
            newPaths.push(`${basePath}${entry.name}`)
          }
        } catch {
          // Skip directories we can't read
        }
      }
      paths = newPaths
    } else {
      // Literal path segment
      paths = paths.map((p) => `${p}${part}`)
    }

    // Add trailing slash for next iteration
    paths = paths.map((p) => `${p}/`)
  }

  // Remove trailing slashes and filter to existing directories
  const results: string[] = []
  for (const p of paths) {
    const cleaned = p.replace(/\/$/, '')
    if (await isDirectory(cleaned)) {
      results.push(cleaned)
    }
  }
  return results
}

/**
 * List all projects based on projectPaths patterns.
 *
 * @param options - Optional filters for project listing
 * @returns Array of ProjectInfo objects with slug and path
 */
export const listProjects = async (
  options?: ListProjectsOptions,
): Promise<ProjectInfo[]> => {
  const globalConfig = await getGlobalConfig()
  const projectPaths = globalConfig.projectPaths
  const withConfig = options?.withConfig ?? false

  const seenPaths = new Set<string>()
  const projects: ProjectInfo[] = []

  for (const pattern of projectPaths) {
    const expandedPaths = await expandPattern(pattern)

    for (const projectPath of expandedPaths) {
      // Skip duplicates
      if (seenPaths.has(projectPath)) continue
      seenPaths.add(projectPath)

      // Check for config file if required
      if (withConfig) {
        const configPath = `${projectPath}/.denvig.yml`
        if (!(await pathExists(configPath))) continue
      }

      const slug = await getProjectSlug(projectPath)
      projects.push({ slug, path: projectPath })
    }
  }

  return projects.sort((a, b) => a.slug.localeCompare(b.slug))
}
