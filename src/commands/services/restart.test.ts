import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { servicesRestartCommand } from './restart.ts'

describe('servicesRestartCommand', () => {
  it('should be defined', () => {
    ok(servicesRestartCommand)
    ok(servicesRestartCommand.name === 'services:restart')
  })

  it('should have correct usage', () => {
    ok(servicesRestartCommand.usage === 'services restart [name]')
  })
})
