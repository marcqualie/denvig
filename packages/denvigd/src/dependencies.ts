import { detectDependencies } from '@denvig/sdk/internal'

import type { DependencyState, Store } from './store.ts'

/**
 * Lockfile parsing is the most expensive thing the daemon does, so background
 * warming runs only a couple of loads at a time.
 */
const WARM_CONCURRENCY = 2

/**
 * Load dependencies for a checkout, reusing a load already in flight.
 * Resolves once the state is `ready` or `error`, or with null when the
 * checkout is unknown.
 */
export const loadDependencies = (
  store: Store,
  path: string,
): Promise<DependencyState | null> => {
  const state = store.dependencies.get(path)
  const handle = store.handles.get(path)
  if (!state || !handle) return Promise.resolve(null)
  if (state.status === 'ready' || state.status === 'error') {
    return Promise.resolve(state)
  }
  if (state.pending) {
    return state.pending.then(() => loadDependencies(store, path))
  }

  const generation = state.generation
  state.status = 'loading'
  state.pending = detectDependencies(handle)
    .then(
      (data) => ({ data, error: undefined }),
      (error: unknown) => ({ data: undefined, error: String(error) }),
    )
    .then(({ data, error }) => {
      const latest = store.dependencies.get(path)
      // The checkout was removed, or its files changed while loading. Leave the
      // newer state alone; the next request loads again.
      if (latest !== state || state.generation !== generation) return
      state.status = error ? 'error' : 'ready'
      state.data = data
      state.error = error
      state.updatedAt = new Date().toISOString()
      state.pending = undefined
    })
  // Re-enter so a load superseded by a newer change waits for the fresh one.
  return state.pending.then(() => loadDependencies(store, path))
}

/**
 * Mark a checkout's dependencies as out of date. Any cached data is kept so it
 * can still be served while a fresh load runs.
 */
export const markDependenciesStale = (store: Store, path: string): void => {
  const state = store.dependencies.get(path)
  if (!state) return
  state.generation++
  state.status = 'stale'
  state.pending = undefined
}

/**
 * Create a queue that loads stale dependencies in the background.
 */
export const createWarmQueue = (store: Store) => {
  const queued = new Set<string>()
  let running = 0

  const pump = () => {
    while (running < WARM_CONCURRENCY && queued.size > 0) {
      const [path] = queued
      queued.delete(path)
      running++
      loadDependencies(store, path).finally(() => {
        running--
        pump()
      })
    }
  }

  return {
    enqueue: (paths: Iterable<string>) => {
      for (const path of paths) queued.add(path)
      pump()
    },
  }
}

export type WarmQueue = ReturnType<typeof createWarmQueue>
