import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseServiceIdentifier } from './identifier.ts'

describe('parseServiceIdentifier', () => {
  it('should parse a plain service name as current project', () => {
    const result = parseServiceIdentifier('api', 'github:owner/repo')
    deepStrictEqual(result, {
      projectSlug: 'github:owner/repo',
      serviceName: 'api',
    })
  })

  it('should parse global: prefix', () => {
    const result = parseServiceIdentifier('global:redis', 'github:owner/repo')
    deepStrictEqual(result, {
      projectSlug: 'global',
      serviceName: 'redis',
    })
  })

  it('should parse global: prefix with hyphenated name', () => {
    const result = parseServiceIdentifier(
      'global:my-database',
      'github:owner/repo',
    )
    deepStrictEqual(result, {
      projectSlug: 'global',
      serviceName: 'my-database',
    })
  })

  it('should parse global: with empty service name', () => {
    const result = parseServiceIdentifier('global:', 'github:owner/repo')
    deepStrictEqual(result, {
      projectSlug: 'global',
      serviceName: '',
    })
  })
})
