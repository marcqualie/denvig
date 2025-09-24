import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import rubyPlugin from './ruby.ts'

describe('ruby plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(rubyPlugin.name, 'ruby')
  })

  it('should have actions function', () => {
    strictEqual(typeof rubyPlugin.actions, 'function')
  })
})
