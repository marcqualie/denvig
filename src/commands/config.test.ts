import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'

import { runTestCommand } from '../test/utils/runTestCommand.ts'

describe('commands / config', () => {
  it('should return the global and project config without errors', async () => {
    const result = await runTestCommand('denvig config')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Global:')
    expect(result.stdout).toContain('Project:')
    expect(result.stderr).toBe('')
  })
})
