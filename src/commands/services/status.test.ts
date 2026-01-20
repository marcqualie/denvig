import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { servicesStatusCommand } from './status.ts'

describe('servicesStatusCommand', () => {
  it('should be defined', () => {
    ok(servicesStatusCommand)
    ok(servicesStatusCommand.name === 'services:status')
  })

  it('should have correct usage', () => {
    ok(servicesStatusCommand.usage === 'services status <name>')
  })
})
