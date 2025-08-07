import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'

import { runTestCommand } from '../test/utils/runTestCommand.ts'

describe('commands / run', () => {
  it('should execute the lint action successfully', async () => {
    const result = await runTestCommand('denvig run lint')

    expect(result.code).toBe(0)
    expect(result.stderr).toBe('')
    // Should have some output from the build process
    expect(result.stdout.length).toBeGreaterThan(0)
  })

  it('should return error code for non-existent action', async () => {
    const result = await runTestCommand('denvig run nonexistent')

    expect(result.code).toBe(1)
    expect(result.stdout).toBe('')
    expect(result.stderr).toBe(
      'Action "nonexistent" not found in project Denvig.',
    )
  })

  it('should display usage when no action is provided', async () => {
    const result = await runTestCommand('denvig run')

    expect(result.code).toBe(0)
    expect(result.stdout).toContain('Usage: denvig run')
    expect(result.stdout).toContain('Available actions:')
    expect(result.stderr).toBe('')
  })
})
