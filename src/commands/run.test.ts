import { match, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from '../test/utils/runTestCommand.ts'

describe('commands / run', () => {
  it('should execute the lint action successfully', async () => {
    const result = await runTestCommand('denvig run lint')

    strictEqual(result.code, 0)
    // Should have some output from the lint process
    match(result.stdout, /pnpm run lint/)
    match(result.stdout, /biome check/)
    // Stderr may contain lint warnings/errors, but that's okay as long as exit code is 0
  })

  it('should return error code for non-existent action', async () => {
    const result = await runTestCommand('denvig run nonexistent')

    strictEqual(result.code, 1)
    strictEqual(result.stdout, '')
    strictEqual(
      result.stderr,
      'Action "nonexistent" not found in project Denvig.',
    )
  })

  it('should display usage when no action is provided', async () => {
    const result = await runTestCommand('denvig run')

    strictEqual(result.code, 0)
    match(result.stdout, /Usage: denvig run/)
    match(result.stdout, /Available actions:/)
    strictEqual(result.stderr, '')
  })

  it('should format multi-line actions with proper alignment', async () => {
    const result = await runTestCommand('denvig run')

    strictEqual(result.code, 0)

    // Verify that multi-line actions are properly aligned
    // The "check:" action should have subsequent lines aligned with the first command
    match(result.stdout, /check: pnpm run check-types\n\s{9}pnpm run lint/)
    match(
      result.stdout,
      /compile: denvig run compile:darwin-x64\n\s{11}denvig run compile:darwin-arm64/,
    )

    // Ensure single-line actions still work normally
    match(result.stdout, /build: pnpm run build/)
    match(result.stdout, /test: pnpm run test/)

    strictEqual(result.stderr, '')
  })
})
