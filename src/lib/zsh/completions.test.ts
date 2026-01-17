import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { ROOT_COMMANDS, SUBCOMMANDS } from '../commands.ts'
import { zshCompletionsFor } from './completions.ts'

describe('completions / zshCompletionsFor()', () => {
  it('should return the root commands when no subcommand is provided', async () => {
    const completions = await zshCompletionsFor(['denvig'])
    deepStrictEqual(completions, [...ROOT_COMMANDS])
  })

  it('should return the filtered list when a subcommand is partially provided', async () => {
    const completions = await zshCompletionsFor(['denvig', 'ser'])
    deepStrictEqual(completions, ['services'])
  })

  it('should returns the subcommands for a given root command', async () => {
    const completions = await zshCompletionsFor(['denvig', 'services'])
    deepStrictEqual(completions, [...SUBCOMMANDS.services])
  })

  it('should return the filtered subcommands for a given root command and partial subcommand', async () => {
    const completions = await zshCompletionsFor(['denvig', 'services', 'sta'])
    deepStrictEqual(completions, ['start', 'status'])
  })
})
