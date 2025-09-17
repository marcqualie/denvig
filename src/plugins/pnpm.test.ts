import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import pnpmPlugin from './pnpm.ts'

describe('pnpm plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(pnpmPlugin.name, 'pnpm')
  })

  it('should have actions function', () => {
    strictEqual(typeof pnpmPlugin.actions, 'function')
  })
})
