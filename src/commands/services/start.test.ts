import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { servicesStartCommand } from './start.ts'

describe('servicesStartCommand', () => {
  it('should be defined', () => {
    ok(servicesStartCommand)
    ok(servicesStartCommand.name === 'services:start')
  })

  it('should have correct usage', () => {
    ok(
      servicesStartCommand.usage ===
        'services start [name] [--format table|json]',
    )
  })
})
