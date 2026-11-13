import type { GitProviderMatch } from '@denvig/sdk'
import type { ProjectDependencySchema, Worktree } from '@denvig/sdk/internal'

/**
 * A checkout as served by the API. Plain data so responses are a straight
 * `JSON.stringify` of what is already in memory.
 */
export type WorktreeRecord = {
  id: string
  slug: string
  refs: string[]
  name: string
  path: string
  branch: string
  isPrimary: boolean
  gitProvider: GitProviderMatch | null
  config: Worktree['config']
  actions: Record<string, string[]>
  services: Worktree['services']
  packageManagers: string[]
}

/**
 * A project: its primary checkout's identity plus every checkout.
 */
export type ProjectRecord = {
  id: string
  slug: string
  refs: string[]
  name: string
  path: string
  gitProvider: GitProviderMatch | null
  /**
   * The primary checkout's git directory, or null for non-git projects.
   */
  gitDir: string | null
  worktrees: WorktreeRecord[]
}

export type DependencyState = {
  status: 'stale' | 'loading' | 'ready' | 'error'
  /**
   * Bumped every time the dependency files change, so a load that finishes
   * after a newer change does not overwrite the stale marker.
   */
  generation: number
  data?: ProjectDependencySchema[]
  error?: string
  updatedAt?: string
  pending?: Promise<void>
}

export type Match = {
  project: ProjectRecord
  worktree: WorktreeRecord
}

export type Store = {
  /**
   * Primary checkout path → project.
   */
  projects: Map<string, ProjectRecord>
  /**
   * Any checkout path → match.
   */
  byPath: Map<string, Match>
  /**
   * Project and worktree ids → match.
   */
  byId: Map<string, Match>
  /**
   * Every ref (`id:`, `local:`, `github:`, …) plus provider-less slugs → match.
   */
  byRef: Map<string, Match>
  /**
   * Live SDK worktrees, keyed by checkout path, used to load dependencies.
   */
  handles: Map<string, Worktree>
  /**
   * Dependency cache, keyed by checkout path.
   */
  dependencies: Map<string, DependencyState>
  scannedAt: string | null
}

/**
 * Shortest id prefix accepted for lookups, to avoid ambiguous matches.
 */
const MIN_ID_PREFIX = 4

export const createStore = (): Store => ({
  projects: new Map(),
  byPath: new Map(),
  byId: new Map(),
  byRef: new Map(),
  handles: new Map(),
  dependencies: new Map(),
  scannedAt: null,
})

const stripSlugPrefix = (slug: string): string =>
  slug.replace(/^[a-z][a-z0-9-]*:/, '')

const indexMatch = (store: Store, match: Match, isProjectRoot: boolean) => {
  const { worktree } = match
  store.byPath.set(worktree.path, match)
  store.byId.set(worktree.id, match)
  for (const ref of worktree.refs) {
    // Worktrees share refs like `github:owner/repo` with their primary, which
    // is indexed first and keeps them.
    if (store.byRef.get(ref)?.project !== match.project) {
      store.byRef.set(ref, match)
    }
  }
  // Provider-less slugs (`owner/repo`) resolve to the primary checkout only,
  // as every worktree of a project shares the same slug.
  if (isProjectRoot) {
    store.byRef.set(worktree.slug, match)
    store.byRef.set(stripSlugPrefix(worktree.slug), match)
  }
}

/**
 * Remove a project and every index entry that points at it.
 */
export const removeProject = (store: Store, primaryPath: string): void => {
  const existing = store.projects.get(primaryPath)
  if (!existing) return
  store.projects.delete(primaryPath)
  const deleteOwned = (index: Map<string, Match>, key: string) => {
    if (index.get(key)?.project === existing) index.delete(key)
  }
  for (const worktree of existing.worktrees) {
    deleteOwned(store.byPath, worktree.path)
    deleteOwned(store.byId, worktree.id)
    for (const ref of worktree.refs) deleteOwned(store.byRef, ref)
    deleteOwned(store.byRef, worktree.slug)
    deleteOwned(store.byRef, stripSlugPrefix(worktree.slug))
    store.handles.delete(worktree.path)
    store.dependencies.delete(worktree.path)
  }
}

/**
 * Insert or replace a project. Dependency state is kept for checkouts that
 * still exist and dropped for ones that have gone.
 */
export const upsertProject = (
  store: Store,
  project: ProjectRecord,
  handles: Worktree[],
): void => {
  const previousDeps = new Map<string, DependencyState>()
  for (const worktree of store.projects.get(project.path)?.worktrees ?? []) {
    const deps = store.dependencies.get(worktree.path)
    if (deps) previousDeps.set(worktree.path, deps)
  }
  removeProject(store, project.path)

  store.projects.set(project.path, project)
  for (const worktree of project.worktrees) {
    indexMatch(store, { project, worktree }, worktree.isPrimary)
  }
  for (const handle of handles) {
    store.handles.set(handle.path, handle)
    store.dependencies.set(
      handle.path,
      previousDeps.get(handle.path) ?? { status: 'stale', generation: 0 },
    )
  }
}

/**
 * Resolve a project by id, id prefix, ref, provider-less slug or path. A match
 * on a detached worktree returns that worktree; anything else returns the
 * primary checkout.
 */
export const findProject = (store: Store, query: string): Match | null => {
  const direct =
    store.byId.get(query) ??
    store.byRef.get(query) ??
    store.byPath.get(query.replace(/\/+$/, ''))
  if (direct) return direct

  const id = query.startsWith('id:') ? query.slice(3) : query
  if (id.length < MIN_ID_PREFIX || !/^[0-9a-f]+$/.test(id)) return null
  for (const [key, match] of store.byId) {
    if (key.startsWith(id)) return match
  }
  return null
}

/**
 * All projects, sorted by path to match `sdk.projects.list()`.
 */
export const listProjects = (store: Store): ProjectRecord[] =>
  [...store.projects.values()].sort((a, b) => a.path.localeCompare(b.path))
