import { deepStrictEqual, strictEqual, throws } from 'node:assert'
import { describe, it } from 'node:test'

import { DenvigValidationError } from '../errors.ts'
import { type ResolvedAction, resolveAction } from './resolve.ts'

const actions: ResolvedAction[] = [
  { name: 'build', ecosystem: 'project', commands: ['tsc'] },
  { name: 'build', ecosystem: 'npm', commands: ['npm run build'] },
  {
    name: 'compile:darwin-x64',
    ecosystem: 'project',
    commands: ['bun build x64'],
  },
  {
    name: 'compile:linux-arm64',
    ecosystem: 'project',
    commands: ['bun build arm64'],
  },
]

describe('resolveAction()', () => {
  it('resolves an action whose name contains a colon literally', () => {
    const action = resolveAction(actions, 'compile:darwin-x64')
    strictEqual(action.name, 'compile:darwin-x64')
    deepStrictEqual(action.commands, ['bun build x64'])
  })

  it('treats `ecosystem:name` as a shorthand when no literal action matches', () => {
    const action = resolveAction(actions, 'npm:build')
    strictEqual(action.ecosystem, 'npm')
    deepStrictEqual(action.commands, ['npm run build'])
  })

  it('merges commands across sources when no ecosystem is given', () => {
    const action = resolveAction(actions, 'build')
    deepStrictEqual(action.commands, ['tsc', 'npm run build'])
  })

  it('honours an explicit ecosystem argument', () => {
    const action = resolveAction(actions, 'build', 'npm')
    deepStrictEqual(action.commands, ['npm run build'])
  })

  it('throws when the action does not exist', () => {
    throws(
      () => resolveAction(actions, 'compile:windows-x64'),
      DenvigValidationError,
    )
  })
})
