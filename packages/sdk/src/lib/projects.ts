import { readdir } from 'node:fs/promises'

import { expandTilde, getGlobalConfig } from './config.ts'
import { projectSlug } from './project/refs.ts'
import { DenvigProject } from './project.ts'
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

  // Expand every pattern in parallel.
  const expanded = await Promise.all(projectPaths.map(expandPattern))

  // Deduplicate, preserving discovery order.
  const seenPaths = new Set<string>()
  const uniquePaths: string[] = []
  for (const projectPath of expanded.flat()) {
    if (seenPaths.has(projectPath)) continue
    seenPaths.add(projectPath)
    uniquePaths.push(projectPath)
  }

  // Resolve each project in parallel - the only async work per project is
  // the optional `.denvig.yml` existence check; `projectSlug()` is sync.
  const projects = (
    await Promise.all(
      uniquePaths.map(async (projectPath): Promise<ProjectInfo | null> => {
        if (withConfig) {
          const configPath = `${projectPath}/.denvig.yml`
          if (!(await pathExists(configPath))) return null
        }
        return { slug: projectSlug(projectPath), path: projectPath }
      }),
    )
  ).filter((project): project is ProjectInfo => project !== null)

  return projects.sort((a, b) => a.slug.localeCompare(b.slug))
}

/** Slug and path of a single resolvable checkout. */
export type CheckoutMeta = {
  slug: string
  path: string
}

/**
 * Map every resolvable checkout id to its slug and path. This covers the
 * primary checkout and each detached worktree of every configured project.
 *
 * Service state and gateway routes only record a project id, so the gateway
 * and the reconciler use this map to resolve that id back to a real checkout.
 * An id that is absent from the map belongs to a worktree that has since been
 * deleted — its services and routes are orphaned. The global project is not
 * included here; callers that need it add it themselves.
 */
export const resolveProjectCheckouts = async (): Promise<
  Map<string, CheckoutMeta>
> => {
  const projects = await listProjects({ withConfig: true })
  const byId = new Map<string, CheckoutMeta>()
  await Promise.all(
    projects.map(async (info) => {
      const project = await DenvigProject.retrieve(info.path)
      for (const worktree of project.worktrees) {
        byId.set(worktree.id, {
          slug: worktree.slug,
          path: worktree.path,
        })
      }
    }),
  )
  return byId
}
