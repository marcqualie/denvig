import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from '../../test/utils/runTestCommand.ts'

describe('commands / shell completions', () => {
  it('should output the zsh completion script', async () => {
    const result = await runTestCommand('denvig shell completions zsh')

    strictEqual(result.code, 0)
    strictEqual(result.stderr, '')
    strictEqual(result.stdout.includes('#compdef denvig'), true)
    strictEqual(result.stdout.includes('denvig shell __complete__'), true)
  })

  it('should show help when no shell is provided', async () => {
    const result = await runTestCommand('denvig shell completions')

    strictEqual(result.code, 1)
    strictEqual(
      result.stderr.includes('Missing required argument: shell'),
      true,
    )
    strictEqual(result.stdout.includes('#compdef denvig'), false)
  })

  it('should error with a helpful message for unsupported shells', async () => {
    const result = await runTestCommand('denvig shell completions bash')

    strictEqual(result.code, 1)
    strictEqual(
      result.stderr.includes('Unsupported shell for completions: bash'),
      true,
    )
    strictEqual(result.stderr.includes('zsh'), true)
  })
})
