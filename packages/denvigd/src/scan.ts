import { existsSync } from 'node:fs'
import {
  InternalDenvigProject,
  listProjects,
  readGitInfo,
} from '@denvig/sdk/internal'

import { removeProject, upsertProject } from './store.ts'

import type { Worktree } from '@denvig/sdk/internal'
import type { ProjectRecord, Store, WorktreeRecord } from './store.ts'

/**
 * How many projects are read from disk at once during a full scan.
 */
const SCAN_CONCURRENCY = 16

/**
 * Run `fn` over `items` with at most `limit` calls in flight.
 */
export const mapLimit = async <T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> => {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index])
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, worker),
  )
  return results
}

const toWorktreeRecord = async (
  worktree: Worktree,
): Promise<WorktreeRecord> => ({
  id: worktree.id,
  slug: worktree.slug,
  refs: worktree.refs,
  name: worktree.name,
  path: worktree.path,
  branch: worktree.branch,
  isPrimary: worktree.isPrimary,
  gitProvider: worktree.gitProvider,
  config: worktree.config,
  actions: await worktree.actions,
  services: worktree.services,
  packageManagers: worktree.packageManagers,
})

/**
 * Read a project (from any of its checkout paths) into a record plus the live
 * SDK worktrees used for dependency loading.
 */
export const readProject = async (
  path: string,
): Promise<{ record: ProjectRecord; handles: Worktree[] }> => {
  const project = await InternalDenvigProject.retrieve(path)
  const worktrees = await Promise.all(project.worktrees.map(toWorktreeRecord))
  return {
    record: {
      id: project.id,
      slug: project.slug,
      refs: project.refs,
      name: project.name,
      path: project.path,
      gitProvider: project.gitProvider,
      gitDir: readGitInfo(project.path)?.primaryGitDir ?? null,
      worktrees,
    },
    handles: project.worktrees,
  }
}

/**
 * Re-read a single project. Removes it from the store when its primary
 * checkout no longer exists.
 */
export const refreshProject = async (
  store: Store,
  primaryPath: string,
): Promise<void> => {
  if (!existsSync(primaryPath)) {
    removeProject(store, primaryPath)
    return
  }
  const { record, handles } = await readProject(primaryPath)
  upsertProject(store, record, handles)
}

/**
 * Bring the store in line with the configured project paths: read projects
 * that are new, drop ones that have gone. With `rebuild`, every project is
 * re-read (eg. after the global config changes slugs or git providers).
 *
 * Returns the primary paths of projects that were added or re-read.
 */
export const syncProjects = async (
  store: Store,
  { rebuild = false }: { rebuild?: boolean } = {},
): Promise<string[]> => {
  const discovered = await listProjects()
  const discoveredPaths = new Set(discovered.map((p) => p.path))

  // Discovered paths can be detached worktrees of a known project, so a project
  // is kept while its primary or any of its checkouts is still discovered.
  for (const project of [...store.projects.values()]) {
    const stillListed = project.worktrees.some((wt) =>
      discoveredPaths.has(wt.path),
    )
    if (!stillListed) removeProject(store, project.path)
  }

  const toRead = rebuild
    ? discovered
    : discovered.filter((p) => !store.byPath.has(p.path))

  const seenPrimaries = new Set<string>()
  const changed: string[] = []
  await mapLimit(toRead, SCAN_CONCURRENCY, async ({ path }) => {
    try {
      const { record, handles } = await readProject(path)
      // Sibling worktrees of one project are discovered separately but read
      // into the same family; keep the first.
      if (seenPrimaries.has(record.path)) return
      seenPrimaries.add(record.path)
      upsertProject(store, record, handles)
      changed.push(record.path)
    } catch (error) {
      console.error(`Failed to read project ${path}: ${String(error)}`)
    }
  })

  store.scannedAt = new Date().toISOString()
  return changed
}
