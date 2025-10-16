import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import launchctl, { getUserDomain, list, print } from './launchctl.ts'

describe('launchctl', () => {
  describe('getUserDomain()', () => {
    it('should return domain in correct format', () => {
      const domain = getUserDomain()
      ok(domain.startsWith('gui/'))
      ok(domain.length > 4)
    })

    it('should work via default export', () => {
      const domain = launchctl.getUserDomain()
      ok(domain.startsWith('gui/'))
      ok(domain.length > 4)
    })
  })

  describe('list()', () => {
    it('should return array of services', async () => {
      const services = await list()
      ok(Array.isArray(services))
    })

    it('should filter services by pattern', async () => {
      const services = await list('com.apple')
      ok(Array.isArray(services))
      services.forEach((service) => {
        ok(service.label.includes('com.apple'))
      })
    })

    it('should work via default export', async () => {
      const services = await launchctl.list()
      ok(Array.isArray(services))
    })
  })

  describe('print()', () => {
    it('should return null for non-existent service', async () => {
      const info = await print('com.denvig.nonexistent.service')
      ok(info === null)
    })

    it('should work via default export', async () => {
      const info = await launchctl.print('com.denvig.nonexistent.service')
      ok(info === null)
    })
  })
})
