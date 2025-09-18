import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import npmPlugin from './npm.ts'

describe('npm plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(npmPlugin.name, 'npm')
  })

  it('should have actions function', () => {
    strictEqual(typeof npmPlugin.actions, 'function')
  })
})
