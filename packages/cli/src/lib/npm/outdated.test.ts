import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { extractDepInfo } from './outdated.ts'

describe('extractDepInfo()', () => {
  it('returns the first version entry for plain importer specifiers', () => {
    const info = extractDepInfo({
      versions: [
        { resolved: '1.2.3', specifier: '^1.2.0', source: '.#dependencies' },
      ],
    })
    strictEqual(info?.current, '1.2.3')
    strictEqual(info?.specifier, '^1.2.0')
    strictEqual(info?.isDevDependency, false)
  })

  it('skips literal `catalog:` specifiers in favour of a real range', () => {
    const info = extractDepInfo({
      versions: [
        {
          resolved: '14.0.14',
          specifier: 'catalog:',
          source: 'apps/api#devDependencies',
        },
        {
          resolved: '14.0.14',
          specifier: '^14.0.14',
          source: 'pnpm-workspace.yaml$catalog',
        },
      ],
    })
    strictEqual(info?.current, '14.0.14')
    strictEqual(info?.specifier, '^14.0.14')
    strictEqual(info?.isDevDependency, true)
  })

  it('skips named-catalog specifiers (`catalog:<name>`)', () => {
    const info = extractDepInfo({
      versions: [
        {
          resolved: '18.3.1',
          specifier: 'catalog:legacy',
          source: 'apps/web#dependencies',
        },
        {
          resolved: '18.3.1',
          specifier: '^18.3.1',
          source: 'pnpm-workspace.yaml$catalogs.legacy',
        },
      ],
    })
    strictEqual(info?.specifier, '^18.3.1')
  })

  it('falls back to the first specifier when only catalog entries exist', () => {
    const info = extractDepInfo({
      versions: [
        {
          resolved: '14.0.14',
          specifier: 'catalog:',
          source: 'apps/api#devDependencies',
        },
      ],
    })
    strictEqual(info?.specifier, 'catalog:')
  })
})
