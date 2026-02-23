import { ok, strictEqual } from 'node:assert'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it } from 'node:test'

import { getGitHubSlug, getProjectSlug, parseGitHubRemoteUrl } from './git.ts'

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
	repositoryformatversion = 0
	filemode = true
[remote "upstream"]
	url = git@github.com:other/repo.git
	fetch = +refs/heads/*:refs/remotes/upstream/*
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
	repositoryformatversion = 0
	filemode = true
[remote "origin"]
	url = git@github.com:marcqualie/denvig.git
	fetch = +refs/heads/*:refs/remotes/origin/*
[branch "main"]
	remote = origin
	merge = refs/heads/main
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
	url = https://github.com/owner/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
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
	url = git@gitlab.com:owner/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
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
	url = git@github.com:upstream/repo.git
	fetch = +refs/heads/*:refs/remotes/upstream/*
[remote "origin"]
	url = git@github.com:fork/repo.git
	fetch = +refs/heads/*:refs/remotes/origin/*
`,
      )
      const result = await getGitHubSlug(tempDir)
      strictEqual(result, 'fork/repo')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return null for non-existent directory', async () => {
    const result = await getGitHubSlug('/non/existent/path/that/does/not/exist')
    strictEqual(result, null)
  })
})

describe('getProjectSlug()', () => {
  const createTempDir = (): string => {
    return fs.mkdtempSync(path.join(os.tmpdir(), 'denvig-test-'))
  }

  const createGitConfig = (tempDir: string, content: string): void => {
    const gitDir = path.join(tempDir, '.git')
    fs.mkdirSync(gitDir, { recursive: true })
    fs.writeFileSync(path.join(gitDir, 'config'), content)
  }

  it('should return github: slug for GitHub project', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "origin"]
	url = git@github.com:owner/repo.git
`,
      )
      const result = await getProjectSlug(tempDir)
      strictEqual(result, 'github:owner/repo')
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return local: slug for directory without git', async () => {
    const tempDir = createTempDir()
    try {
      const result = await getProjectSlug(tempDir)
      ok(result.startsWith('local:'))
      ok(result.includes(tempDir))
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return local: slug for non-GitHub remote', async () => {
    const tempDir = createTempDir()
    try {
      createGitConfig(
        tempDir,
        `
[remote "origin"]
	url = git@gitlab.com:owner/repo.git
`,
      )
      const result = await getProjectSlug(tempDir)
      ok(result.startsWith('local:'))
      ok(result.includes(tempDir))
    } finally {
      fs.rmSync(tempDir, { recursive: true })
    }
  })

  it('should return local: slug with absolute path', async () => {
    const result = await getProjectSlug('/Users/marc/dotfiles')
    strictEqual(result, 'local:/Users/marc/dotfiles')
  })
})
