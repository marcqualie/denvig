import assert from 'node:assert'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { inspect } from 'node:util'

import { projectRefs } from './refs.ts'

const mockProjectPath = '/tmp/denvig-test-mock-project'
const worktreePath = `${mockProjectPath}-worktree1`

function assertArrayIncludes<T>(arr: T[], value: T, context?: string) {
  assert.ok(
    arr.includes(value),
    `${context ? `${context}\n` : ''}Expected array to include ${inspect(value)}\nReceived: ${inspect(arr, { depth: null })}`,
  )
}

describe('projectRefs()', () => {
  beforeEach(() => {
    fs.mkdirSync(mockProjectPath, { recursive: true })
    execSync('git init -q -b main', { cwd: mockProjectPath })
  })
  afterEach(() => {
    fs.rmSync(mockProjectPath, { recursive: true, force: true })
    fs.rmSync(worktreePath, { recursive: true, force: true })
  })

  it('should include an ID ref that is a SHA1 hash of the project config', () => {
    const refs = projectRefs(mockProjectPath)
    const idRef = refs.find((ref) => ref.startsWith('id:'))
    assert.ok(idRef, 'Expected an id: ref to be included')
    const id = idRef.slice(3)
    assert.strictEqual(
      id.length,
      40,
      'Expected ID to be a 40-character SHA1 hash',
    )
  })

  it('should include a local path reference to the project', () => {
    const refs = projectRefs('/path/to/project')
    assertArrayIncludes(refs, 'local:/path/to/project')
  })

  describe('with git repository', () => {
    beforeEach(() => {
      execSync('git remote add origin git@github.com:marcqualie/denvig.git', {
        cwd: mockProjectPath,
      })
      execSync('git commit --allow-empty -q -m "Initial commit"', {
        cwd: mockProjectPath,
      })
    })

    it('adds a github: ref for github remotes on origin', () => {
      const refs = projectRefs(mockProjectPath)
      assertArrayIncludes(refs, 'github:marcqualie/denvig')
    })

    it('adds a git-worktree: ref for the primary worktree using its real path', () => {
      const realPath = fs.realpathSync(mockProjectPath)
      const refs = projectRefs(mockProjectPath)
      assertArrayIncludes(refs, `git-worktree:${realPath}+main`)
    })

    it('reports `main` for the primary worktree even on a non-main branch', () => {
      execSync('git checkout -q -b feature/foo', { cwd: mockProjectPath })
      const realPath = fs.realpathSync(mockProjectPath)
      const refs = projectRefs(mockProjectPath)
      assertArrayIncludes(refs, `git-worktree:${realPath}+main`)
    })

    it('detects detached worktrees and uses the primary path as the prefix', () => {
      execSync(`git worktree add ${worktreePath} -b test-branch`, {
        cwd: mockProjectPath,
      })
      const realPrimary = fs.realpathSync(mockProjectPath)
      const refs = projectRefs(worktreePath)
      assertArrayIncludes(refs, `git-worktree:${realPrimary}+test-branch`)
    })

    it('groups primary and detached worktrees by a shared git-worktree: prefix', () => {
      execSync(`git worktree add ${worktreePath} -b test-branch`, {
        cwd: mockProjectPath,
      })
      const realPrimary = fs.realpathSync(mockProjectPath)
      const primaryWorktreeRef = projectRefs(mockProjectPath).find((ref) =>
        ref.startsWith('git-worktree:'),
      )
      const detachedWorktreeRef = projectRefs(worktreePath).find((ref) =>
        ref.startsWith('git-worktree:'),
      )
      assert.ok(primaryWorktreeRef)
      assert.ok(detachedWorktreeRef)
      const prefix = `git-worktree:${realPrimary}+`
      assert.ok(
        primaryWorktreeRef.startsWith(prefix),
        `expected primary worktree ref to start with ${prefix}, got ${primaryWorktreeRef}`,
      )
      assert.ok(
        detachedWorktreeRef.startsWith(prefix),
        `expected detached worktree ref to start with ${prefix}, got ${detachedWorktreeRef}`,
      )
      assert.notStrictEqual(
        primaryWorktreeRef,
        detachedWorktreeRef,
        'primary and detached worktree refs should be unique',
      )
    })

    it('produces a unique id: per worktree', () => {
      execSync(`git worktree add ${worktreePath} -b test-branch`, {
        cwd: mockProjectPath,
      })
      const primaryId = projectRefs(mockProjectPath).find((ref) =>
        ref.startsWith('id:'),
      )
      const detachedId = projectRefs(worktreePath).find((ref) =>
        ref.startsWith('id:'),
      )
      assert.ok(primaryId)
      assert.ok(detachedId)
      assert.notStrictEqual(primaryId, detachedId)
    })
  })
})
