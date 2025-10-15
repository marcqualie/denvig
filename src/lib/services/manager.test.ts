import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { DenvigProject } from '../project.ts'
import { ServiceManager } from './manager.ts'

describe('ServiceManager', () => {
  describe('listServices()', () => {
    it('should return empty array when no services configured', async () => {
      const project = new DenvigProject('test-project')
      const manager = new ServiceManager(project)
      const services = await manager.listServices()

      ok(Array.isArray(services))
    })
  })

  describe('sanitizeForFilename()', () => {
    it('should replace special characters with hyphens', () => {
      const project = new DenvigProject('test-project')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const sanitized = (manager as any).sanitizeForFilename('dev:watch')

      strictEqual(sanitized, 'dev-watch')
    })

    it('should handle multiple special characters', () => {
      const project = new DenvigProject('test-project')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const sanitized = (manager as any).sanitizeForFilename('api@v2:dev')

      strictEqual(sanitized, 'api-v2-dev')
    })

    it('should collapse multiple hyphens', () => {
      const project = new DenvigProject('test-project')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const sanitized = (manager as any).sanitizeForFilename('api::watch')

      strictEqual(sanitized, 'api-watch')
    })

    it('should remove leading and trailing hyphens', () => {
      const project = new DenvigProject('test-project')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const sanitized = (manager as any).sanitizeForFilename(':api:')

      strictEqual(sanitized, 'api')
    })
  })

  describe('getServiceLabel()', () => {
    it('should generate correct service label format', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const label = (manager as any).getServiceLabel('api')

      strictEqual(label, 'com.denvig.my-app.api')
    })

    it('should sanitize service name with special characters', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const label = (manager as any).getServiceLabel('dev:watch')

      strictEqual(label, 'com.denvig.my-app.dev-watch')
    })
  })

  describe('getPlistPath()', () => {
    it('should generate correct plist path', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const path = (manager as any).getPlistPath('api')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes('com.denvig.my-app.api.plist'))
    })

    it('should sanitize special characters in plist filename', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const path = (manager as any).getPlistPath('dev:watch')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes('com.denvig.my-app.dev-watch.plist'))
      ok(!path.includes(':'))
    })
  })

  describe('getLogPath()', () => {
    it('should generate correct stdout log path', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const path = (manager as any).getLogPath('api', 'stdout')

      strictEqual(path, '/tmp/denvig-my-app-api.log')
    })

    it('should generate correct stderr log path', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const path = (manager as any).getLogPath('api', 'stderr')

      strictEqual(path, '/tmp/denvig-my-app-api.error.log')
    })

    it('should sanitize special characters in log filename', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      // Access private method via any cast for testing
      const path = (manager as any).getLogPath('dev:watch', 'stdout')

      strictEqual(path, '/tmp/denvig-my-app-dev-watch.log')
      ok(!path.includes(':'))
    })
  })

  describe('startService() with envFile', () => {
    it('should return error when envFile does not exist', async () => {
      const project = new DenvigProject('denvig')

      // Set up a service with a non-existent envFile
      project.config.services = {
        'test-service-envfile': {
          command: 'echo test',
          envFile: 'this-file-definitely-does-not-exist-12345.env',
        },
      }

      const manager = new ServiceManager(project)
      const result = await manager.startService('test-service-envfile')

      ok(!result.success)
      ok(result.message.includes('not found'))
    })
  })
})
