import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { stopCommand } from './stop.ts'

describe('stopCommand', () => {
  it('should be defined', () => {
    ok(stopCommand)
    ok(stopCommand.name === 'stop')
  })

  it('should have correct usage', () => {
    ok(stopCommand.usage === 'stop [name] [--format table|json]')
  })
})
