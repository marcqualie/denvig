import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { systemPortsCommand } from './index.ts'

describe('systemPortsCommand', () => {
  it('defaults to listing ports', () => {
    strictEqual(systemPortsCommand.defaultSubcommand, 'list')
  })

  it('exposes list, info and kill subcommands', () => {
    deepStrictEqual(Object.keys(systemPortsCommand.subcommands), [
      'list',
      'info',
      'kill',
    ])
  })

  it('requires a port for info and kill', () => {
    for (const name of ['info', 'kill']) {
      const [arg] = systemPortsCommand.subcommands[name].args
      strictEqual(arg.name, 'port')
      strictEqual(arg.required, true)
    }
  })
})
