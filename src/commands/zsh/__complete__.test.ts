import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from '../../test/utils/runTestCommand.ts'

describe('commands / zsh __complete__', () => {
  it('should return subcommands for services command', async () => {
    const result = await runTestCommand(
      'denvig zsh __complete__ -- denvig services',
    )

    strictEqual(result.code, 0)
    strictEqual(result.stderr, '')

    const completions = result.stdout.split('\n').filter(Boolean)
    strictEqual(completions.includes('start'), true)
    strictEqual(completions.includes('stop'), true)
    strictEqual(completions.includes('status'), true)
    strictEqual(completions.includes('restart'), true)
    strictEqual(completions.includes('logs'), true)
    strictEqual(completions.includes('teardown'), true)
  })

  it('should return service names for services start command', async () => {
    const result = await runTestCommand(
      'denvig zsh __complete__ -- denvig services start',
    )

    strictEqual(result.code, 0)
    strictEqual(result.stderr, '')

    const completions = result.stdout.split('\n').filter(Boolean)
    strictEqual(completions.includes('hello'), true)
    strictEqual(completions.includes('wontlaunch'), true)
  })

  it('should return all detected actions for run command', async () => {
    const result = await runTestCommand('denvig zsh __complete__ -- denvig run')

    strictEqual(result.code, 0)
    strictEqual(result.stderr, '')

    const completions = result.stdout.split('\n').filter(Boolean)
    // Config-defined actions
    strictEqual(completions.includes('check'), true)
    strictEqual(completions.includes('compile'), true)
    // Package.json scripts (detected by plugins)
    strictEqual(completions.includes('build'), true)
    strictEqual(completions.includes('test'), true)
    strictEqual(completions.includes('lint'), true)
  })
})
