import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { servicesRunCommand } from './run.ts'

describe('servicesRunCommand', () => {
  it('should be defined', () => {
    ok(servicesRunCommand)
    ok(servicesRunCommand.name === 'services:run')
  })

  it('should have correct usage', () => {
    ok(
      servicesRunCommand.usage ===
        'services run <name> [--worktree <branch>] [--port <port>] [--domains <list>] [--no-domains]',
    )
  })
})
