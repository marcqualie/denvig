import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import uvPlugin from './uv.ts'

describe('uv plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(uvPlugin.name, 'uv')
  })

  it('should have actions function', () => {
    strictEqual(typeof uvPlugin.actions, 'function')
  })
})
