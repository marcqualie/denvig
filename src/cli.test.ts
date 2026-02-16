import { match, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { runTestCommand } from './test/utils/runTestCommand.ts'

describe('cli', () => {
  it('should display help with commands list', async () => {
    const result = await runTestCommand('denvig')

    strictEqual(result.code, 1)
    match(result.stdout, /Denvig v/)
    match(result.stdout, /Commands:/)
    match(result.stdout, /denvig run \[action\]/)
    match(result.stdout, /denvig services/)
    match(result.stdout, /denvig version/)

    // Verify Options section
    match(result.stdout, /Options:/)
    match(result.stdout, /-h, --help/)
    match(result.stdout, /-v, --version/)

    strictEqual(result.stderr, '')
  })

  it('should display help with --help flag and exit 0', async () => {
    const result = await runTestCommand('denvig --help')

    strictEqual(result.code, 0)
    match(result.stdout, /Denvig v/)
    match(result.stdout, /Commands:/)
    strictEqual(result.stderr, '')
  })

  it('should display command help with --help flag', async () => {
    const result = await runTestCommand('denvig services --help')

    strictEqual(result.code, 0)
    match(result.stdout, /Usage: denvig services/)
    match(result.stdout, /List all services/)
    match(result.stdout, /Subcommands:/)
    match(result.stdout, /start/)
    match(result.stdout, /stop/)
    strictEqual(result.stderr, '')
  })

  it('should display command help for commands with required args', async () => {
    const result = await runTestCommand('denvig services start --help')

    strictEqual(result.code, 0)
    match(result.stdout, /Usage: denvig services start <name>/)
    match(result.stdout, /Arguments:/)
    match(result.stdout, /name/)
    strictEqual(result.stderr, '')
  })
})
