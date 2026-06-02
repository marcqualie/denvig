import assert from 'node:assert'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { inspect } from 'node:util'

import { projectId, projectRefs, projectSlug } from './refs.ts'

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
      // CI doesn't have a global git identity; configure it locally so
      // `git commit` and `git worktree add` (which creates a commit) succeed.
      execSync('git config user.email "test@denvig.test"', {
        cwd: mockProjectPath,
      })
      execSync('git config user.name "Denvig Test"', {
        cwd: mockProjectPath,
      })
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

    it('adds a git: ref for the primary worktree using the normalised remote', () => {
      const refs = projectRefs(mockProjectPath)
      assertArrayIncludes(refs, 'git:github.com/marcqualie/denvig+main')
    })

    it('reports `+main` for the primary worktree even on a non-main branch', () => {
      execSync('git checkout -q -b feature/foo', { cwd: mockProjectPath })
      const refs = projectRefs(mockProjectPath)
      assertArrayIncludes(refs, 'git:github.com/marcqualie/denvig+main')
    })

    it('uses the branch name in the git: ref for detached worktrees', () => {
      execSync(`git worktree add ${worktreePath} -b test-branch`, {
        cwd: mockProjectPath,
      })
      const refs = projectRefs(worktreePath)
      assertArrayIncludes(refs, 'git:github.com/marcqualie/denvig+test-branch')
    })

    it('groups primary and detached worktrees by a shared git: prefix', () => {
      execSync(`git worktree add ${worktreePath} -b test-branch`, {
        cwd: mockProjectPath,
      })
      const primaryGitRef = projectRefs(mockProjectPath).find((ref) =>
        ref.startsWith('git:'),
      )
      const detachedGitRef = projectRefs(worktreePath).find((ref) =>
        ref.startsWith('git:'),
      )
      assert.ok(primaryGitRef)
      assert.ok(detachedGitRef)
      const prefix = 'git:github.com/marcqualie/denvig+'
      assert.ok(
        primaryGitRef.startsWith(prefix),
        `expected primary git ref to start with ${prefix}, got ${primaryGitRef}`,
      )
      assert.ok(
        detachedGitRef.startsWith(prefix),
        `expected detached git ref to start with ${prefix}, got ${detachedGitRef}`,
      )
      assert.notStrictEqual(
        primaryGitRef,
        detachedGitRef,
        'primary and detached worktree refs should be unique',
      )
    })

    it('keeps the id: stable when the primary worktree switches branches', () => {
      const before = projectRefs(mockProjectPath).find((ref) =>
        ref.startsWith('id:'),
      )
      execSync('git checkout -q -b feature/foo', { cwd: mockProjectPath })
      const after = projectRefs(mockProjectPath).find((ref) =>
        ref.startsWith('id:'),
      )
      assert.ok(before)
      assert.ok(after)
      assert.strictEqual(
        before,
        after,
        'id: ref should not change when only the primary checkout branch changes',
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

    it('does not emit a git-worktree: ref', () => {
      const refs = projectRefs(mockProjectPath)
      assert.ok(
        !refs.some((ref) => ref.startsWith('git-worktree:')),
        `expected no git-worktree: ref, got ${inspect(refs)}`,
      )
    })

    it('uses the `github` remote as a fallback for the github: ref when origin is not on GitHub', () => {
      execSync('git remote remove origin', { cwd: mockProjectPath })
      execSync('git remote add origin git@gitea.example.com:owner/mirror.git', {
        cwd: mockProjectPath,
      })
      execSync('git remote add github git@github.com:marcqualie/denvig.git', {
        cwd: mockProjectPath,
      })
      const refs = projectRefs(mockProjectPath)
      assertArrayIncludes(refs, 'github:marcqualie/denvig')
    })
  })
})

describe('projectSlug()', () => {
  beforeEach(() => {
    fs.mkdirSync(mockProjectPath, { recursive: true })
    execSync('git init -q -b main', { cwd: mockProjectPath })
  })
  afterEach(() => {
    fs.rmSync(mockProjectPath, { recursive: true, force: true })
  })

  it('returns the github: ref when present', () => {
    execSync('git remote add origin git@github.com:marcqualie/denvig.git', {
      cwd: mockProjectPath,
    })
    assert.strictEqual(projectSlug(mockProjectPath), 'github:marcqualie/denvig')
  })

  it('returns the local: ref when there is no github remote', () => {
    assert.strictEqual(
      projectSlug('/path/to/project'),
      'local:/path/to/project',
    )
  })
})

describe('projectId()', () => {
  it('returns the hash portion of the id: ref', () => {
    const id = projectId('/path/to/project')
    assert.strictEqual(id.length, 40, 'id should be a sha1 hex digest')
    const refs = projectRefs('/path/to/project')
    assertArrayIncludes(refs, `id:${id}`)
  })
})
