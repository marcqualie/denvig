import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'
import { DenvigSDK } from '@denvig/sdk'

import { runTestCommand } from '../test/utils/runTestCommand.ts'

describe('commands / version', () => {
  it('should return the current CLI version with status 0', async () => {
    const result = await runTestCommand('denvig version')
    const version = new DenvigSDK({ client: 'test' }).version()

    strictEqual(result.code, 0)
    strictEqual(result.stdout, `v${version}`)
    strictEqual(result.stderr, '')
  })
})
