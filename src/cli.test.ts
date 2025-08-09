import { match, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from './test/utils/runTestCommand.ts'

describe('cli', () => {
  it('should display usage with properly formatted quick actions', async () => {
    const result = await runTestCommand('denvig')

    strictEqual(result.code, 1)
    match(result.stdout, /Usage: denvig <command>/)
    match(result.stdout, /Quick Actions:/)

    // Verify that multi-line quick actions are properly aligned
    // The "check" action should have subsequent lines aligned properly
    match(result.stdout, /check\s+\$ pnpm run check-types\n\s{27}pnpm run lint/)
    match(
      result.stdout,
      /compile\s+\$ denvig run compile:darwin-x64\n\s{27}denvig run compile:darwin-arm64/,
    )

    // Ensure single-line actions still work normally
    match(result.stdout, /build\s+\$ pnpm run build/)
    match(result.stdout, /test\s+\$ pnpm run test/)

    strictEqual(result.stderr, '')
  })
})
