import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { buildDynamicDomain } from './domains.ts'

describe('buildDynamicDomain', () => {
  it('suffixes the first DNS label', () => {
    strictEqual(
      buildDynamicDomain('hello.denvig.me', 'jit-domains'),
      'hello-jit-domains.denvig.me',
    )
  })

  it('slugifies the suffix', () => {
    strictEqual(
      buildDynamicDomain('hello.denvig.me', 'Feature/My Branch'),
      'hello-feature-my-branch.denvig.me',
    )
  })

  it('returns the domain unchanged when the suffix has no usable characters', () => {
    strictEqual(buildDynamicDomain('hello.denvig.me', '///'), 'hello.denvig.me')
  })

  it('handles single-label domains', () => {
    strictEqual(buildDynamicDomain('hello', 'wt'), 'hello-wt')
  })
})
