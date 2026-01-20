import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { servicesStopCommand } from './stop.ts'

describe('servicesStopCommand', () => {
  it('should be defined', () => {
    ok(servicesStopCommand)
    ok(servicesStopCommand.name === 'services:stop')
  })

  it('should have correct usage', () => {
    ok(servicesStopCommand.usage === 'services stop <name>')
  })
})
