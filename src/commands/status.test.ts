import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { statusCommand } from './status.ts'

describe('statusCommand', () => {
  it('should be defined', () => {
    ok(statusCommand)
    ok(statusCommand.name === 'status')
  })

  it('should have correct usage', () => {
    ok(statusCommand.usage === 'status <name>')
  })
})
