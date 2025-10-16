import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { restartCommand } from './restart.ts'

describe('restartCommand', () => {
  it('should be defined', () => {
    ok(restartCommand)
    ok(restartCommand.name === 'restart')
  })

  it('should have correct usage', () => {
    ok(restartCommand.usage === 'restart [name]')
  })
})
