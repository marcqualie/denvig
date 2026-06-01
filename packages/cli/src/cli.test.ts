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
    match(result.stdout, /List services for the current project/)
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

  it('should error on unknown top-level command', async () => {
    const result = await runTestCommand('denvig typocommand')

    strictEqual(result.code, 1)
    match(result.stderr, /Command "typocommand" not found/)
    // Root help block follows the error message
    match(result.stderr, /Denvig v/)
    match(result.stderr, /Commands:/)
  })

  it('should error on unknown subcommand instead of running default', async () => {
    const result = await runTestCommand('denvig services listtt')

    strictEqual(result.code, 1)
    match(result.stderr, /Unknown subcommand "listtt" for "services"/)
    match(result.stderr, /Available subcommands:/)
    match(result.stderr, /list/)
    // Help block follows the error message
    match(result.stderr, /Usage: denvig services <subcommand>/)
    match(result.stderr, /Subcommands:/)
  })

  it('should error on unknown nested subcommand', async () => {
    const result = await runTestCommand('denvig certs ca whatever')

    strictEqual(result.code, 1)
    match(result.stderr, /Unknown subcommand "whatever" for "certs:ca"/)
  })

  it('should error on unknown long flag', async () => {
    const result = await runTestCommand('denvig services list --al')

    strictEqual(result.code, 1)
    match(result.stderr, /Unknown flag: --al/)
    // Help block follows the error message
    match(result.stderr, /Usage: denvig services list/)
    match(result.stderr, /Options:/)
  })

  it('should error on unknown long flag when falling back to default subcommand', async () => {
    const result = await runTestCommand('denvig services --al')

    strictEqual(result.code, 1)
    match(result.stderr, /Unknown flag: --al/)
  })

  it('should error on unknown short flag', async () => {
    const result = await runTestCommand('denvig services list -x')

    strictEqual(result.code, 1)
    match(result.stderr, /Unknown flag: -x/)
  })

  it('should error on unexpected positional argument', async () => {
    const result = await runTestCommand('denvig services list extra-arg')

    strictEqual(result.code, 1)
    match(result.stderr, /Unexpected argument: "extra-arg"/)
  })

  it('should still accept the default subcommand when no positional given', async () => {
    const result = await runTestCommand('denvig services --json')

    strictEqual(result.code, 0)
    strictEqual(result.stderr, '')
  })

  it('should allow extra args to be passed through to run', async () => {
    const result = await runTestCommand('denvig run nonexistent --foo bar')

    strictEqual(result.code, 1)
    match(result.stderr, /Action "nonexistent" not found/)
  })
})
