import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import {
  createStore,
  findProject,
  listProjects,
  removeProject,
  upsertProject,
} from './store.ts'

import type { Worktree } from '@denvig/sdk/internal'
import type { ProjectRecord, WorktreeRecord } from './store.ts'

const worktree = (
  id: string,
  path: string,
  isPrimary: boolean,
): WorktreeRecord => ({
  id,
  slug: 'github:acme/api',
  refs: [`id:${id}`, `local:${path}`, 'github:acme/api'],
  name: 'api',
  path,
  branch: isPrimary ? 'main' : 'feature',
  isPrimary,
  gitProvider: null,
  config: { $sources: [] },
  actions: {},
  services: {},
  packageManagers: [],
})

const project = (worktrees: WorktreeRecord[]): ProjectRecord => ({
  id: worktrees[0].id,
  slug: worktrees[0].slug,
  refs: worktrees[0].refs,
  name: 'api',
  path: worktrees[0].path,
  gitProvider: null,
  gitDir: `${worktrees[0].path}/.git`,
  worktrees,
})

const handles = (record: ProjectRecord) =>
  record.worktrees.map((wt) => ({ path: wt.path }) as Worktree)

const seed = () => {
  const store = createStore()
  const record = project([
    worktree('aaaa1111', '/src/acme/api', true),
    worktree('bbbb2222', '/src/acme/api/.worktrees/feature', false),
  ])
  upsertProject(store, record, handles(record))
  return { store, record }
}

describe('findProject()', () => {
  it('should find by full id, id prefix and id: ref', () => {
    const { store } = seed()
    strictEqual(findProject(store, 'aaaa1111')?.worktree.isPrimary, true)
    strictEqual(findProject(store, 'aaaa')?.worktree.isPrimary, true)
    strictEqual(findProject(store, 'id:aaaa1111')?.worktree.isPrimary, true)
  })

  it('should require at least four characters for id prefixes', () => {
    const { store } = seed()
    strictEqual(findProject(store, 'aaa'), null)
  })

  it('should resolve slugs to the primary checkout', () => {
    const { store } = seed()
    strictEqual(findProject(store, 'github:acme/api')?.worktree.isPrimary, true)
    strictEqual(findProject(store, 'acme/api')?.worktree.isPrimary, true)
  })

  it('should find a detached worktree by its id or path', () => {
    const { store } = seed()
    const path = '/src/acme/api/.worktrees/feature'
    strictEqual(findProject(store, 'bbbb2222')?.worktree.path, path)
    strictEqual(findProject(store, `${path}/`)?.worktree.path, path)
    strictEqual(findProject(store, 'bbbb2222')?.project.path, '/src/acme/api')
  })
})

describe('upsertProject()', () => {
  it('should keep dependency state for checkouts that still exist', () => {
    const { store, record } = seed()
    const state = store.dependencies.get('/src/acme/api')
    if (state) state.status = 'ready'

    const next = project([record.worktrees[0]])
    upsertProject(store, next, handles(next))

    strictEqual(store.dependencies.get('/src/acme/api')?.status, 'ready')
    strictEqual(
      store.dependencies.has('/src/acme/api/.worktrees/feature'),
      false,
    )
    strictEqual(findProject(store, 'bbbb2222'), null)
  })
})

describe('removeProject()', () => {
  it('should clear every index', () => {
    const { store } = seed()
    removeProject(store, '/src/acme/api')
    deepStrictEqual(listProjects(store), [])
    strictEqual(store.byId.size, 0)
    strictEqual(store.byPath.size, 0)
    strictEqual(store.byRef.size, 0)
    strictEqual(store.handles.size, 0)
  })
})
