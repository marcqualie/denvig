import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { getDenvigVersion } from '../lib/version.ts'
import { runTestCommand } from '../test/utils/runTestCommand.ts'

describe('commands / version', () => {
  it('should return the current CLI version with status 0', async () => {
    const result = await runTestCommand('denvig version')

    strictEqual(result.code, 0)
    strictEqual(result.stdout, `v${getDenvigVersion()}`)
    strictEqual(result.stderr, '')
  })
})
