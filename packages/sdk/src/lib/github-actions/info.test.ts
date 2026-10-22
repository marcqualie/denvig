import assert from 'node:assert'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { listRemoteTags, parseTagCommits } from './info.ts'

describe('listRemoteTags()', () => {
  let dir: string
  let repoUrl: string
  let previousGlobalConfig: string | undefined

  before(() => {
    dir = mkdtempSync(resolve(tmpdir(), 'denvig-test-ls-remote-'))
    const repo = resolve(dir, 'repo')
    const git = (...args: string[]) =>
      execFileSync('git', args, {
        cwd: repo,
        env: {
          ...process.env,
          GIT_CONFIG_GLOBAL: '/dev/null',
          GIT_AUTHOR_NAME: 'Test',
          GIT_AUTHOR_EMAIL: 'test@example.com',
          GIT_COMMITTER_NAME: 'Test',
          GIT_COMMITTER_EMAIL: 'test@example.com',
        },
      })
    execFileSync('git', ['init', '-q', repo])
    git('commit', '-q', '--allow-empty', '-m', 'init')
    git('tag', 'v1.2.3')
    repoUrl = `file://${repo}`

    // Simulate a user config that rewrites the URL somewhere unreachable,
    // like `url.git@github.com:.insteadOf https://github.com/` does.
    const userConfig = resolve(dir, 'gitconfig')
    writeFileSync(
      userConfig,
      `[url "file://${dir}/missing"]\n\tinsteadOf = ${repoUrl}\n`,
    )
    previousGlobalConfig = process.env.GIT_CONFIG_GLOBAL
    process.env.GIT_CONFIG_GLOBAL = userConfig
  })

  after(() => {
    if (previousGlobalConfig === undefined) {
      delete process.env.GIT_CONFIG_GLOBAL
    } else {
      process.env.GIT_CONFIG_GLOBAL = previousGlobalConfig
    }
    rmSync(dir, { recursive: true, force: true })
  })

  it('should fail with the user config applied (sanity check)', () => {
    assert.throws(() =>
      execFileSync('git', ['ls-remote', '--tags', repoUrl], { stdio: 'pipe' }),
    )
  })

  it('should ignore user URL rewrites when listing tags', async () => {
    const stdout = await listRemoteTags(repoUrl)
    assert.deepStrictEqual(Object.values(parseTagCommits(stdout)), ['1.2.3'])
  })
})
