import { match, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from '../test/utils/runTestCommand.ts'

describe('commands / config', () => {
  it('should return the global and project config without errors', async () => {
    const result = await runTestCommand('denvig config')

    strictEqual(result.code, 0)
    match(result.stdout, /Global:/)
    match(result.stdout, /Project:/)
    strictEqual(result.stderr, '')
  })
})
