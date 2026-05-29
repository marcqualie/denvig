import assert, { strictEqual } from 'node:assert'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'
import { inspect } from 'node:util'

import {
  detectProjectWorktrees,
  findDetachedWorktreeRoot,
  getGitHubSlug,
  normaliseGitRemote,
  parseGitHubRemoteUrl,
} from './git.ts'

const mockProjectPath = '/tmp/denvig-test-mock-git'
const worktreePath = `${mockProjectPath}-worktree1`

describe('parseGitHubRemoteUrl()', () => {
  describe('SSH format', () => {
    it('should parse standard SSH URL with .git suffix', () => {
      const result = parseGitHubRemoteUrl('git@github.com:owner/repo.git')
      strictEqual(result, 'owner/repo')
    })

    it('should parse SSH URL without .git suffix', () => {
      const result = parseGitHubRemoteUrl('git@github.com:owner/repo')
      strictEqual(result, 'owner/repo')
    })

    it('should handle owner with hyphens', () => {
      const result = parseGitHubRemoteUrl('git@github.com:my-org/my-repo.git')
      strictEqual(result, 'my-org/my-repo')
    })

    it('should handle owner with underscores', () => {
      const result = parseGitHubRemoteUrl('git@github.com:my_org/my_repo.git')
      strictEqual(result, 'my_org/my_repo')
    })

    it('should handle repo with dots', () => {
      const result = parseGitHubRemoteUrl('git@github.com:owner/repo.js.git')
      strictEqual(result, 'owner/repo.js')
    })

    it('should handle numeric owner/repo names', () => {
      const result = parseGitHubRemoteUrl('git@github.com:123/456.git')
      strictEqual(result, '123/456')
    })
  })

  describe('HTTPS format', () => {
    it('should parse standard HTTPS URL with .git suffix', () => {
      const result = parseGitHubRemoteUrl('https://github.com/owner/repo.git')
      strictEqual(result, 'owner/repo')
    })

    it('should parse HTTPS URL without .git suffix', () => {
      const result = parseGitHubRemoteUrl('https://github.com/owner/repo')
      strictEqual(result, 'owner/repo')
    })

    it('should handle owner with hyphens', () => {
      const result = parseGitHubRemoteUrl(
        'https://github.com/my-org/my-repo.git',
      )
      strictEqual(result, 'my-org/my-repo')
    })

    it('should handle repo with dots', () => {
      const result = parseGitHubRemoteUrl(
        'https://github.com/owner/repo.js.git',
      )
      strictEqual(result, 'owner/repo.js')
    })
  })

  describe('non-GitHub URLs', () => {
    it('should return null for GitLab SSH URL', () => {
      const result = parseGitHubRemoteUrl('git@gitlab.com:owner/repo.git')
      strictEqual(result, null)
    })

    it('should return null for GitLab HTTPS URL', () => {
      const result = parseGitHubRemoteUrl('https://gitlab.com/owner/repo.git')
      strictEqual(result, null)
    })

    it('should return null for Bitbucket SSH URL', () => {
      const result = parseGitHubRemoteUrl('git@bitbucket.org:owner/repo.git')
      strictEqual(result, null)
    })

    it('should return null for Bitbucket HTTPS URL', () => {
      const result = parseGitHubRemoteUrl(
        'https://bitbucket.org/owner/repo.git',
      )
      strictEqual(result, null)
    })

    it('should return null for self-hosted Git URL', () => {
      const result = parseGitHubRemoteUrl('git@git.company.com:owner/repo.git')
      strictEqual(result, null)
    })

    it('should return null for file:// URL', () => {
      const result = parseGitHubRemoteUrl('file:///path/to/repo.git')
      strictEqual(result, null)
    })
  })

  describe('malformed URLs', () => {
    it('should return null for empty string', () => {
      const result = parseGitHubRemoteUrl('')
      strictEqual(result, null)
    })

    it('should return null for just github.com', () => {
      const result = parseGitHubRemoteUrl('github.com')
      strictEqual(result, null)
    })

    it('should return null for URL without owner', () => {
      const result = parseGitHubRemoteUrl('https://github.com/repo')
      strictEqual(result, null)
    })

    it('should return null for URL with only owner', () => {
      const result = parseGitHubRemoteUrl('git@github.com:owner')
      strictEqual(result, null)
    })

    it('should return null for HTTP (non-HTTPS) URL', () => {
      const result = parseGitHubRemoteUrl('http://github.com/owner/repo.git')
      strictEqual(result, null)
    })

    it('should return null for URL with trailing slash', () => {
      const result = parseGitHubRemoteUrl('https://github.com/owner/repo/')
      strictEqual(result, null)
    })

    it('should return null for URL with extra path segments', () => {
      const result = parseGitHubRemoteUrl(
        'https://github.com/owner/repo/tree/main',
      )
      strictEqual(result, null)
    })

    it('should return null for SSH URL with wrong separator', () => {
      const result = parseGitHubRemoteUrl('git@github.com/owner/repo.git')
      strictEqual(result, null)
    })

    it('should return null for random string', () => {
      const result = parseGitHubRemoteUrl('not-a-url')
      strictEqual(result, null)
    })

    it('should return null for URL with spaces', () => {
      const result = parseGitHubRemoteUrl('git@github.com:owner/repo name.git')
      strictEqual(result, null)
    })

    it('should return null for URL with newlines', () => {
      const result = parseGitHubRemoteUrl('git@github.com:owner/repo\n.git')
      strictEqual(result, null)
    })
  })

  describe('edge cases', () => {
    it('should handle very long owner/repo names', () => {
      const longName = 'a'.repeat(100)
      const result = parseGitHubRemoteUrl(
        `git@github.com:${longName}/${longName}.git`,
      )
      strictEqual(result, `${longName}/${longName}`)
    })

    it('should handle single character owner/repo', () => {
      const result = parseGitHubRemoteUrl('git@github.com:a/b.git')
      strictEqual(result, 'a/b')
    })

    it('should handle mixed case', () => {
      const result = parseGitHubRemoteUrl('git@github.com:Owner/Repo.git')
      strictEqual(result, 'Owner/Repo')
    })

    it('should handle repo ending in .git (before suffix)', () => {
      const result = parseGitHubRemoteUrl('git@github.com:owner/my.git.git')
      strictEqual(result, 'owner/my.git')
    })
  })
})

describe('getGitHubSlug()', () => {
  const createTempDir = (): string => {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'denvig-test-'))
  }

  const createGitConfig = (tempDir: string, content: string): void => {
    const gitDir = path.join(tempDir, '.git')
    fs.mkdirSync(gitDir, { recursive: true })
    fs.writeFileSync(path.join(gitDir, 'config'), content)
  }

  it('should return null for directory without .git folder', async () => {
    const tempDir = createTempDir()
    try {
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, null)
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return null for directory with empty .git/config', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(tempDir, '')
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, null)
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return null for .git/config without origin remote', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[core]
\trepositoryformatversion = 0
\tfilemode = true
[remote "upstream"]
\turl = git@github.com:other/repo.git
\tfetch = +refs/heads/*:refs/remotes/upstream/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, null)
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should parse GitHub SSH remote from .git/config', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[core]
\trepositoryformatversion = 0
\tfilemode = true
[remote "origin"]
\turl = git@github.com:marcqualie/denvig.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
\tremote = origin
\tmerge = refs/heads/main
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, 'marcqualie/denvig')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should parse GitHub HTTPS remote from .git/config', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "origin"]
\turl = https://github.com/owner/repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, 'owner/repo')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return null for non-GitHub remote', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "origin"]
\turl = git@gitlab.com:owner/repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, null)
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should handle .git/config with multiple remotes', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "upstream"]
\turl = git@github.com:upstream/repo.git
\tfetch = +refs/heads/*:refs/remotes/upstream/*
[remote "origin"]
\turl = git@github.com:fork/repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, 'fork/repo')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should fall back to github remote when origin is non-GitHub', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "origin"]
\turl = git@gitea.example.com:owner/repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[remote "github"]
\turl = https://github.com/owner/repo.git
\tfetch = +refs/heads/*:refs/remotes/github/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, 'owner/repo')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should prefer origin over github remote when both are GitHub', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "origin"]
\turl = git@github.com:origin-owner/repo.git
\tfetch = +refs/heads/*:refs/remotes/origin/*
[remote "github"]
\turl = git@github.com:github-owner/repo.git
\tfetch = +refs/heads/*:refs/remotes/github/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, 'origin-owner/repo')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should use github remote when origin does not exist', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "github"]
\turl = git@github.com:owner/repo.git
\tfetch = +refs/heads/*:refs/remotes/github/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, 'owner/repo')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return null when neither origin nor github remote has GitHub URL', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "origin"]
\turl = git@gitea.example.com:owner/repo.git
[remote "github"]
\turl = git@gitlab.com:owner/repo.git
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, null)
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return null for non-existent directory', async () => {
    const result = await getGitHubSlug('/non/existent/path/that/does/not/exist')
    strictEqual(result, null)
  })
})

describe('normaliseGitRemote()', () => {
  const cases: [string, string | null][] = [
    ['git@github.com:marcqualie/denvig.git', 'github.com/marcqualie/denvig'],
    ['git@github.com:marcqualie/denvig', 'github.com/marcqualie/denvig'],
    [
      'https://github.com/marcqualie/denvig.git',
      'github.com/marcqualie/denvig',
    ],
    ['https://github.com/marcqualie/denvig', 'github.com/marcqualie/denvig'],
    [
      'ssh://git@github.com/marcqualie/denvig.git',
      'github.com/marcqualie/denvig',
    ],
    ['git@gitlab.com:group/sub/repo.git', 'gitlab.com/group/sub/repo'],
    ['not a url', null],
  ]

  for (const [input, expected] of cases) {
    it(`normalises ${inspect(input)} -> ${inspect(expected)}`, () => {
      strictEqual(normaliseGitRemote(input), expected)
    })
  }
})

describe('detectProjectWorktrees()', () => {
  const worktree2Path = `${mockProjectPath}-worktree2`

  beforeEach(() => {
    fs.mkdirSync(mockProjectPath, { recursive: true })
    execSync('git init -q -b main', { cwd: mockProjectPath })
    // CI doesn't have a global git identity; configure it locally so
    // `git commit` and `git worktree add` (which creates a commit) succeed.
    execSync('git config user.email "test@denvig.test"', {
      cwd: mockProjectPath,
    })
    execSync('git config user.name "Denvig Test"', { cwd: mockProjectPath })
    execSync('git commit --allow-empty -q -m "Initial commit"', {
      cwd: mockProjectPath,
    })
  })
  afterEach(() => {
    fs.rmSync(mockProjectPath, { recursive: true, force: true })
    fs.rmSync(worktreePath, { recursive: true, force: true })
    fs.rmSync(worktree2Path, { recursive: true, force: true })
  })

  it('returns an empty array for a project with no detached worktrees', () => {
    assert.deepStrictEqual(detectProjectWorktrees(mockProjectPath), [])
  })

  it('returns an empty array for a non-git directory', () => {
    assert.deepStrictEqual(detectProjectWorktrees('/path/to/project'), [])
  })

  it('lists detached worktrees when called from the primary', () => {
    execSync(`git worktree add ${worktreePath} -b test-branch`, {
      cwd: mockProjectPath,
    })
    const realWorktreePath = fs.realpathSync(worktreePath)
    assert.deepStrictEqual(detectProjectWorktrees(mockProjectPath), [
      { path: realWorktreePath, branch: 'test-branch' },
    ])
  })

  it('lists detached worktrees when called from a detached worktree', () => {
    execSync(`git worktree add ${worktreePath} -b test-branch`, {
      cwd: mockProjectPath,
    })
    const realWorktreePath = fs.realpathSync(worktreePath)
    assert.deepStrictEqual(detectProjectWorktrees(worktreePath), [
      { path: realWorktreePath, branch: 'test-branch' },
    ])
  })

  it('lists multiple worktrees sorted by path', () => {
    execSync(`git worktree add ${worktree2Path} -b branch-b`, {
      cwd: mockProjectPath,
    })
    execSync(`git worktree add ${worktreePath} -b branch-a`, {
      cwd: mockProjectPath,
    })
    const realWorktree = fs.realpathSync(worktreePath)
    const realWorktree2 = fs.realpathSync(worktree2Path)
    assert.deepStrictEqual(detectProjectWorktrees(mockProjectPath), [
      { path: realWorktree, branch: 'branch-a' },
      { path: realWorktree2, branch: 'branch-b' },
    ])
  })
})

describe('findDetachedWorktreeRoot()', () => {
  beforeEach(() => {
    fs.mkdirSync(mockProjectPath, { recursive: true })
    execSync('git init -q -b main', { cwd: mockProjectPath })
    execSync('git config user.email "test@denvig.test"', {
      cwd: mockProjectPath,
    })
    execSync('git config user.name "Denvig Test"', { cwd: mockProjectPath })
    execSync('git commit --allow-empty -q -m "Initial commit"', {
      cwd: mockProjectPath,
    })
  })
  afterEach(() => {
    fs.rmSync(mockProjectPath, { recursive: true, force: true })
    fs.rmSync(worktreePath, { recursive: true, force: true })
  })

  it('returns null for a primary checkout', () => {
    strictEqual(findDetachedWorktreeRoot(mockProjectPath), null)
  })

  it('returns null from a subdirectory of a primary checkout', () => {
    const subDir = path.join(mockProjectPath, 'src', 'commands')
    fs.mkdirSync(subDir, { recursive: true })
    strictEqual(findDetachedWorktreeRoot(subDir), null)
  })

  it('returns null for a path outside any git checkout', () => {
    strictEqual(findDetachedWorktreeRoot('/tmp'), null)
  })

  it('returns the worktree root from a detached worktree', () => {
    execSync(`git worktree add ${worktreePath} -b test-branch`, {
      cwd: mockProjectPath,
    })
    strictEqual(findDetachedWorktreeRoot(worktreePath), worktreePath)
  })

  it('walks up to the worktree root from a worktree subdirectory', () => {
    execSync(`git worktree add ${worktreePath} -b test-branch`, {
      cwd: mockProjectPath,
    })
    const subDir = path.join(worktreePath, 'src')
    fs.mkdirSync(subDir, { recursive: true })
    strictEqual(findDetachedWorktreeRoot(subDir), worktreePath)
  })
})
