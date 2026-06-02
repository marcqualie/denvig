import { ok, rejects, strictEqual, throws } from 'node:assert'
import { describe, it } from 'node:test'

import { getDenvigVersion } from './lib/version.ts'
import { DenvigSDK } from './sdk.ts'

describe('DenvigSDK', () => {
  it('validates the client name', () => {
    throws(() => new DenvigSDK({ client: 'Bad Name' }), /Invalid client name/)
    throws(() => new DenvigSDK({ client: 'trailing-' }), /Invalid client name/)
    ok(new DenvigSDK({ client: 'raycast' }))
    ok(new DenvigSDK({ client: 'my-app-2' }))
  })

  it('returns the version in-process (no subprocess)', async () => {
    const denvig = new DenvigSDK({ client: 'test' })
    strictEqual(await denvig.version(), getDenvigVersion())
  })

  it('rejects services.list when worktree is given without project', async () => {
    const denvig = new DenvigSDK({ client: 'test' })
    await rejects(
      () => denvig.services.list({ worktree: 'main' }),
      /worktree` requires `project`/,
    )
  })
})
