import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseParentFromSource } from './tree.ts'

describe('parseParentFromSource()', () => {
  it('should return null for non-lockfile sources', () => {
    strictEqual(parseParentFromSource('.#dependencies'), null)
    strictEqual(parseParentFromSource('.#devDependencies'), null)
    strictEqual(parseParentFromSource('packages/app#dependencies'), null)
  })

  it('should parse unscoped pnpm lockfile sources', () => {
    deepStrictEqual(parseParentFromSource('pnpm-lock.yaml:tsup@8.5.0'), {
      name: 'tsup',
      version: '8.5.0',
    })
  })

  it('should parse scoped pnpm lockfile sources', () => {
    deepStrictEqual(
      parseParentFromSource(
        'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3',
      ),
      { name: '@serverless/dashboard-plugin', version: '7.2.3' },
    )
  })

  it('should parse sources with peer dependency qualifiers', () => {
    deepStrictEqual(
      parseParentFromSource('pnpm-lock.yaml:tsup@8.5.0(typescript@5.9.3)'),
      { name: 'tsup', version: '8.5.0' },
    )
    deepStrictEqual(
      parseParentFromSource(
        'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3(serverless@3.38.0)',
      ),
      { name: '@serverless/dashboard-plugin', version: '7.2.3' },
    )
  })

  it('should parse yarn lockfile sources', () => {
    deepStrictEqual(parseParentFromSource('yarn.lock:webpack@5.90.0'), {
      name: 'webpack',
      version: '5.90.0',
    })
    deepStrictEqual(parseParentFromSource('yarn.lock:@babel/core@7.24.0'), {
      name: '@babel/core',
      version: '7.24.0',
    })
  })

  it('should parse other lockfile sources', () => {
    deepStrictEqual(parseParentFromSource('Gemfile.lock:rails@7.1.0'), {
      name: 'rails',
      version: '7.1.0',
    })
    deepStrictEqual(parseParentFromSource('uv.lock:requests@2.31.0'), {
      name: 'requests',
      version: '2.31.0',
    })
  })
})
