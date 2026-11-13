import { loadDependencies } from '../dependencies.ts'
import { findProject, listProjects } from '../store.ts'

import type { Store } from '../store.ts'

export type RouteResult = {
  status: number
  body: unknown
}

const notFound = (query: string): RouteResult => ({
  status: 404,
  body: { error: `Project "${query}" not found` },
})

export const listProjectsRoute = (store: Store): RouteResult => ({
  status: 200,
  body: { projects: listProjects(store) },
})

/**
 * A single project. `worktree` is the path of the checkout the query matched,
 * which is the primary unless a detached worktree's id, ref or path was given.
 */
export const getProjectRoute = (store: Store, query: string): RouteResult => {
  const match = findProject(store, query)
  if (!match) return notFound(query)
  return {
    status: 200,
    body: { project: match.project, worktree: match.worktree.path },
  }
}

export const getDependenciesRoute = async (
  store: Store,
  query: string,
): Promise<RouteResult> => {
  const match = findProject(store, query)
  if (!match) return notFound(query)
  const state = await loadDependencies(store, match.worktree.path)
  if (!state) return notFound(query)
  if (state.status === 'error') {
    return { status: 500, body: { error: state.error } }
  }
  return {
    status: 200,
    body: {
      worktree: match.worktree.path,
      updatedAt: state.updatedAt,
      dependencies: state.data ?? [],
    },
  }
}
