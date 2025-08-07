import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'

import { getDenvigVersion } from '../lib/version.ts'
import { runTestCommand } from '../test/utils/runTestCommand.ts'

describe('commands / version', () => {
  it('should return the current CLI version with status 0', async () => {
    const result = await runTestCommand('denvig version')

    expect(result.code).toBe(0)
    expect(result.stdout).toBe(`v${getDenvigVersion()}`)
    expect(result.stderr).toBe('')
  })
})
