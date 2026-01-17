import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { servicesCommand } from './list.ts'

describe('servicesCommand', () => {
  it('should be defined', () => {
    ok(servicesCommand)
    ok(servicesCommand.name === 'services')
  })

  it('should have correct usage', () => {
    ok(servicesCommand.usage === 'services [--format table|json]')
  })
})
