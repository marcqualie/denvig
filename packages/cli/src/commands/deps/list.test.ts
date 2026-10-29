import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from '../../test/utils/runTestCommand.ts'

describe('commands / deps list', () => {
  it('should output a dependabot snapshot with --format dependabot', async () => {
    const result = await runTestCommand(
      'denvig deps list --format dependabot --ecosystem npm',
      {
        env: {
          GITHUB_ACTIONS: 'true',
          GITHUB_EVENT_NAME: 'push',
          GITHUB_EVENT_PATH: '',
          GITHUB_SHA: 'a'.repeat(40),
          GITHUB_REF: 'refs/heads/main',
          GITHUB_RUN_ID: '42',
          GITHUB_SERVER_URL: 'https://github.com',
          GITHUB_REPOSITORY: 'marcqualie/denvig',
        },
      },
    )

    strictEqual(result.code, 0)
    const snapshot = JSON.parse(result.stdout)
    strictEqual(snapshot.version, 0)
    strictEqual(snapshot.sha, 'a'.repeat(40))
    strictEqual(snapshot.ref, 'refs/heads/main')
    deepStrictEqual(snapshot.job, {
      correlator: 'denvig:deps:npm',
      id: '42',
      html_url: 'https://github.com/marcqualie/denvig/actions/runs/42',
    })
    strictEqual(snapshot.detector.name, 'denvig')
    deepStrictEqual(Object.keys(snapshot.manifests), ['pnpm-lock.yaml'])
    ok(
      Object.keys(snapshot.manifests['pnpm-lock.yaml'].resolved).some((key) =>
        key.startsWith('pkg:npm/zod@'),
      ),
    )
  })

  it('should reject unknown formats', async () => {
    const result = await runTestCommand('denvig deps list --format xml')

    strictEqual(result.code, 1)
    ok(result.stderr.includes('Invalid format "xml"'))
  })
})
