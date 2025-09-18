import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import denoPlugin from './deno.ts'

describe('deno plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(denoPlugin.name, 'deno')
  })

  it('should have actions function', () => {
    strictEqual(typeof denoPlugin.actions, 'function')
  })
})
