import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import yarnPlugin from './yarn.ts'

describe('yarn plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(yarnPlugin.name, 'yarn')
  })

  it('should have actions function', () => {
    strictEqual(typeof yarnPlugin.actions, 'function')
  })
})
