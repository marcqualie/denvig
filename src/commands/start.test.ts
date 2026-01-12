import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { startCommand } from './start.ts'

describe('startCommand', () => {
  it('should be defined', () => {
    ok(startCommand)
    ok(startCommand.name === 'start')
  })

  it('should have correct usage', () => {
    ok(startCommand.usage === 'start [name] [--format table|json]')
  })
})
