import { ok, throws } from 'node:assert'
import { describe, it } from 'node:test'

import { DenvigSDK } from './sdk.ts'

describe('DenvigSDK', () => {
  it('validates the client name', () => {
    throws(() => new DenvigSDK({ client: 'Bad Name' }), /Invalid client name/)
    throws(() => new DenvigSDK({ client: 'trailing-' }), /Invalid client name/)
    ok(new DenvigSDK({ client: 'raycast' }))
    ok(new DenvigSDK({ client: 'my-app-2' }))
  })

  it('retrieves the global config in-process (no subprocess)', async () => {
    const denvig = new DenvigSDK({ client: 'test' })
    const config = await denvig.config.retrieve()
    ok(Array.isArray(config.$sources))
  })

  it('lists certificates as an array', async () => {
    const denvig = new DenvigSDK({ client: 'test' })
    const certs = await denvig.certs.list()
    ok(Array.isArray(certs))
  })
})
