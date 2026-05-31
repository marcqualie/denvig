import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { getParentDomain, groupDomainsForCertGeneration } from './certs.ts'

describe('gateway certs', () => {
  describe('getParentDomain()', () => {
    it('should return the parent for a 3-part domain', () => {
      strictEqual(getParentDomain('api.marcqualie.dev'), 'marcqualie.dev')
    })

    it('should return the domain itself for a 2-part domain', () => {
      strictEqual(getParentDomain('denvig.localhost'), 'denvig.localhost')
    })

    it('should return the domain itself for a 1-part domain', () => {
      strictEqual(getParentDomain('localhost'), 'localhost')
    })

    it('should handle deeply nested domains', () => {
      strictEqual(getParentDomain('a.b.c.example.com'), 'b.c.example.com')
    })
  })

  describe('groupDomainsForCertGeneration()', () => {
    it('should group multiple subdomains under a wildcard', () => {
      const groups = groupDomainsForCertGeneration([
        'api.example.com',
        'web.example.com',
      ])
      deepStrictEqual(groups.get('*.example.com'), [
        'api.example.com',
        'web.example.com',
      ])
      strictEqual(groups.size, 1)
    })

    it('should keep a single subdomain as-is', () => {
      const groups = groupDomainsForCertGeneration(['api.example.com'])
      deepStrictEqual(groups.get('api.example.com'), ['api.example.com'])
      strictEqual(groups.size, 1)
    })

    it('should keep bare domains as-is', () => {
      const groups = groupDomainsForCertGeneration(['denvig.localhost'])
      deepStrictEqual(groups.get('denvig.localhost'), ['denvig.localhost'])
      strictEqual(groups.size, 1)
    })

    it('should handle mixed domains from different parents', () => {
      const groups = groupDomainsForCertGeneration([
        'api.example.com',
        'web.example.com',
        'app.other.dev',
      ])
      deepStrictEqual(groups.get('*.example.com'), [
        'api.example.com',
        'web.example.com',
      ])
      deepStrictEqual(groups.get('app.other.dev'), ['app.other.dev'])
      strictEqual(groups.size, 2)
    })
  })
})
