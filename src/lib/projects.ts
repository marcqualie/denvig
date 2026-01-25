import fs from 'node:fs'

import { expandTilde, getGlobalConfig } from './config.ts'
import { getProjectSlug } from './git.ts'

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
const expandPattern = (pattern: string): string[] => {
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
        if (!fs.existsSync(fullPath)) continue

        try {
          const entries = fs.readdirSync(fullPath, { withFileTypes: true })
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
  return paths
    .map((p) => p.replace(/\/$/, ''))
    .filter((p) => {
      try {
        return fs.existsSync(p) && fs.statSync(p).isDirectory()
      } catch {
        return false
      }
    })
}

/**
 * List all projects based on projectPaths patterns.
 *
 * @param options - Optional filters for project listing
 * @returns Array of ProjectInfo objects with slug and path
 */
export const listProjects = (options?: ListProjectsOptions): ProjectInfo[] => {
  const globalConfig = getGlobalConfig()
  const projectPaths = globalConfig.projectPaths
  const withConfig = options?.withConfig ?? false

  const seenPaths = new Set<string>()
  const projects: ProjectInfo[] = []

  for (const pattern of projectPaths) {
    const expandedPaths = expandPattern(pattern)

    for (const projectPath of expandedPaths) {
      // Skip duplicates
      if (seenPaths.has(projectPath)) continue
      seenPaths.add(projectPath)

      // Check for config file if required
      if (withConfig) {
        const configPath = `${projectPath}/.denvig.yml`
        if (!fs.existsSync(configPath)) continue
      }

      const slug = getProjectSlug(projectPath)
      projects.push({ slug, path: projectPath })
    }
  }

  return projects.sort((a, b) => a.slug.localeCompare(b.slug))
}
