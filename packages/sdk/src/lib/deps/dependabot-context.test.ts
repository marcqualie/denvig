import { rejects, strictEqual } from 'node:assert'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { DenvigValidationError } from '../errors.ts'
import { resolveDependabotContext } from './dependabot-context.ts'

const LOCAL_SHA = 'b'.repeat(40)

const fakeGit =
  (responses: Record<string, string | null> = {}) =>
  async (args: string[]): Promise<string | null> => {
    const key = args.join(' ')
    if (key in responses) return responses[key]
    if (key === 'rev-parse HEAD') return LOCAL_SHA
    if (key === 'symbolic-ref -q HEAD') return 'refs/heads/local-branch'
    if (key === 'rev-parse --show-prefix') return ''
    return null
  }

describe('resolveDependabotContext', () => {
  it('should read GitHub Actions environment variables', async () => {
    const context = await resolveDependabotContext({
      cwd: '/repo',
      git: fakeGit(),
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_REF: 'refs/heads/main',
        GITHUB_RUN_ID: '42',
        GITHUB_SERVER_URL: 'https://github.com',
        GITHUB_REPOSITORY: 'acme/app',
      },
    })

    strictEqual(context.sha, 'a'.repeat(40))
    strictEqual(context.ref, 'refs/heads/main')
    strictEqual(context.jobId, '42')
    strictEqual(context.jobUrl, 'https://github.com/acme/app/actions/runs/42')
    strictEqual(context.correlator, 'denvig:deps')
  })

  it('should use the pull request head sha for pull request events', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'denvig-dependabot-'))
    const eventPath = join(dir, 'event.json')
    await writeFile(
      eventPath,
      JSON.stringify({ pull_request: { head: { sha: 'c'.repeat(40) } } }),
    )

    const context = await resolveDependabotContext({
      cwd: '/repo',
      git: fakeGit(),
      env: {
        GITHUB_ACTIONS: 'true',
        GITHUB_EVENT_NAME: 'pull_request',
        GITHUB_EVENT_PATH: eventPath,
        GITHUB_SHA: 'a'.repeat(40),
        GITHUB_REF: 'refs/pull/7/merge',
        GITHUB_RUN_ID: '42',
      },
    })

    strictEqual(context.sha, 'c'.repeat(40))
    strictEqual(context.ref, 'refs/pull/7/merge')
  })

  it('should read CircleCI branch builds', async () => {
    const context = await resolveDependabotContext({
      cwd: '/repo',
      git: fakeGit(),
      env: {
        CIRCLECI: 'true',
        CIRCLE_SHA1: 'd'.repeat(40),
        CIRCLE_BRANCH: 'main',
        CIRCLE_WORKFLOW_ID: 'wf-1',
        CIRCLE_BUILD_URL: 'https://circleci.com/gh/acme/app/1',
      },
    })

    strictEqual(context.sha, 'd'.repeat(40))
    strictEqual(context.ref, 'refs/heads/main')
    strictEqual(context.jobId, 'wf-1')
    strictEqual(context.jobUrl, 'https://circleci.com/gh/acme/app/1')
  })

  it('should read CircleCI tag builds', async () => {
    const context = await resolveDependabotContext({
      cwd: '/repo',
      git: fakeGit(),
      env: {
        CIRCLECI: 'true',
        CIRCLE_SHA1: 'd'.repeat(40),
        CIRCLE_TAG: 'v1.0.0',
      },
    })

    strictEqual(context.ref, 'refs/tags/v1.0.0')
  })

  it('should fall back to local git', async () => {
    const context = await resolveDependabotContext({
      cwd: '/repo',
      git: fakeGit(),
      env: {},
    })

    strictEqual(context.sha, LOCAL_SHA)
    strictEqual(context.ref, 'refs/heads/local-branch')
    strictEqual(context.jobUrl, undefined)
    strictEqual(context.jobId.startsWith('local-'), true)
  })

  it('should include the repository prefix and ecosystem in the correlator', async () => {
    const context = await resolveDependabotContext({
      cwd: '/repo/services/api',
      git: fakeGit({ 'rev-parse --show-prefix': 'services/api/' }),
      env: {},
      ecosystem: 'npm',
    })

    strictEqual(context.pathPrefix, 'services/api')
    strictEqual(context.correlator, 'denvig:deps:services/api:npm')
  })

  it('should throw when the ref cannot be determined', async () => {
    await rejects(
      resolveDependabotContext({
        cwd: '/repo',
        git: fakeGit({ 'symbolic-ref -q HEAD': null }),
        env: {},
      }),
      DenvigValidationError,
    )
  })
})
