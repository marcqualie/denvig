import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { servicesListCommand } from './list.ts'

describe('servicesListCommand', () => {
  it('should be defined', () => {
    ok(servicesListCommand)
    ok(servicesListCommand.name === 'services:list')
  })

  it('should have correct usage', () => {
    ok(servicesListCommand.usage === 'services list')
  })
})
