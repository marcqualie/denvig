/** biome-ignore-all lint/suspicious/noExplicitAny: The print function is overridden for mocking, easier to use any */
import { ok, strictEqual } from 'node:assert'
import { hostname } from 'node:os'
import { describe, it } from 'node:test'

import { createMockProject } from '../../test/mock.ts'
import launchctl from './launchctl.ts'
import { ServiceManager } from './manager.ts'

describe('ServiceManager', () => {
  describe('listServices()', () => {
    it('should return empty array when no services configured', async () => {
      const project = createMockProject('test-project')
      const manager = new ServiceManager(project)
      const services = await manager.listServices()

      ok(Array.isArray(services))
    })
  })

  describe('getServiceLabel()', () => {
    it('should generate correct service label format using project ID', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('api')

      // Label format: denvig.[projectId].[serviceName]
      strictEqual(label, `denvig.${project.id}.api`)
    })

    it('should sanitize service name with special characters', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('dev:watch')

      strictEqual(label, `denvig.${project.id}.dev-watch`)
    })

    it('should generate same label format regardless of slug format', () => {
      const project1 = createMockProject('github:marcqualie/denvig')
      const project2 = createMockProject('local:/Users/marc/dotfiles')
      const manager1 = new ServiceManager(project1)
      const manager2 = new ServiceManager(project2)

      // Both should use the same format: denvig.[id].[service]
      strictEqual(manager1.getServiceLabel('api'), `denvig.${project1.id}.api`)
      strictEqual(manager2.getServiceLabel('api'), `denvig.${project2.id}.api`)
    })
  })

  describe('getPlistPath()', () => {
    it('should generate correct plist path using project ID', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('api')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes(`denvig.${project.id}.api.plist`))
    })

    it('should sanitize special characters in plist filename', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('dev:watch')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes(`denvig.${project.id}.dev-watch.plist`))
      ok(!path.includes(':'))
    })
  })

  describe('getServiceDir()', () => {
    it('should generate correct service directory path', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const dir = manager.getServiceDir('api')

      ok(dir.includes(`.denvig/services/${project.id}.api`))
      ok(!dir.includes('/logs'))
    })
  })

  describe('getServiceScriptPath()', () => {
    it('should include github slug in script filename', () => {
      const project = createMockProject({
        slug: 'github:marcqualie/denvig',
      })
      const manager = new ServiceManager(project)

      const path = manager.getServiceScriptPath('api')

      ok(
        path.includes(
          `.denvig/services/${project.id}.api/denvig-marcqualie-denvig-api`,
        ),
      )
      ok(!path.endsWith('.sh'))
    })

    it('should omit slug prefix for non-github projects', () => {
      const project = createMockProject({
        slug: 'local:/Users/marc/my-app',
      })
      const manager = new ServiceManager(project)

      const path = manager.getServiceScriptPath('api')

      ok(path.endsWith('/denvig-api'))
      ok(!path.includes('local'))
    })

    it('should sanitize special characters in script filename', () => {
      const project = createMockProject({
        slug: 'local:/tmp/test',
      })
      const manager = new ServiceManager(project)

      const path = manager.getServiceScriptPath('dev:watch')

      ok(path.endsWith('/denvig-dev-watch'))
      ok(!path.includes(':'))
    })
  })

  describe('getServiceLogDir()', () => {
    it('should generate correct service log directory path', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const dir = manager.getServiceLogDir('api')

      ok(dir.includes(`.denvig/services/${project.id}.api/logs`))
    })
  })

  describe('getStableLogPath()', () => {
    it('should return latest.log under service log dir', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getStableLogPath('api')

      ok(path.includes(`.denvig/services/${project.id}.api/logs`))
      ok(path.endsWith('/latest.log'))
    })
  })

  describe('getLogPath()', () => {
    it('should generate symlink path with hostname under service log dir', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api')

      ok(path.includes(`.denvig/services/${project.id}.api/logs`))
      ok(path.includes(`latest.${hostname()}.log`))
    })

    it('should accept optional type parameter for backward compatibility', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stdout')

      ok(path.includes(`latest.${hostname()}.log`))
    })

    it('should sanitize special characters in log path', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('dev:watch')

      ok(path.includes(`.denvig/services/${project.id}.dev-watch/logs`))
      ok(path.includes(`latest.${hostname()}.log`))
      ok(!path.includes(':'))
    })
  })

  describe('buildServiceEnvironment()', () => {
    it('should skip missing env files when explicitly specified', async () => {
      const project = createMockProject({
        slug: 'github:marcqualie/denvig',
        path: process.cwd(),
      })

      // Set up a service with a non-existent envFile
      // This should NOT cause an error - env files should be optional
      project.config.services = {
        'test-service-envfile': {
          command: 'echo test',
          envFiles: ['this-file-definitely-does-not-exist-12345.env'],
        },
      }

      const manager = new ServiceManager(project)
      const result = await manager.buildServiceEnvironment(
        'test-service-envfile',
      )

      // Should succeed, silently skipping missing env files
      ok(
        result.success,
        `Expected env build to succeed but got: ${result.success === false ? result.message : 'unknown'}`,
      )
    })
  })

  describe('stopService() launchctl behavior', () => {
    it('should call bootout and disable for regular services', async (t) => {
      const project = createMockProject({
        slug: 'github:owner/repo',
        path: '/tmp/test-stop',
      })
      project.config.services = {
        api: { command: 'node server.js' },
      }
      const manager = new ServiceManager(project)

      // Mock launchctl methods
      t.mock.method(launchctl, 'print', async () => ({
        label: 'test',
        state: 'running',
        status: 'running',
      }))
      const bootoutMock = t.mock.method(launchctl, 'bootout', async () => ({
        success: true,
        output: '',
      }))
      const disableMock = t.mock.method(launchctl, 'disable', async () => ({
        success: true,
        output: '',
      }))
      const stopMock = t.mock.method(launchctl, 'stop', async () => ({
        success: true,
        output: '',
      }))
      // Prevent real gateway reconfiguration
      t.mock.method(manager, 'reconfigureGateway' as any, async () => {})

      const result = await manager.stopService('api')

      ok(result.success)
      strictEqual(bootoutMock.mock.callCount(), 1, 'bootout should be called')
      strictEqual(disableMock.mock.callCount(), 1, 'disable should be called')
      strictEqual(stopMock.mock.callCount(), 0, 'stop should not be called')
    })

    it('should call stop but not bootout or disable for startOnBoot services', async (t) => {
      const project = createMockProject({
        slug: 'github:owner/repo',
        path: '/tmp/test-stop-boot',
      })
      project.config.services = {
        api: { command: 'node server.js', startOnBoot: true },
      }
      const manager = new ServiceManager(project)

      t.mock.method(launchctl, 'print', async () => ({
        label: 'test',
        state: 'running',
        status: 'running',
      }))
      const bootoutMock = t.mock.method(launchctl, 'bootout', async () => ({
        success: true,
        output: '',
      }))
      const disableMock = t.mock.method(launchctl, 'disable', async () => ({
        success: true,
        output: '',
      }))
      const stopMock = t.mock.method(launchctl, 'stop', async () => ({
        success: true,
        output: '',
      }))

      const result = await manager.stopService('api')

      ok(result.success)
      strictEqual(stopMock.mock.callCount(), 1, 'stop should be called')
      strictEqual(
        bootoutMock.mock.callCount(),
        0,
        'bootout should not be called',
      )
      strictEqual(
        disableMock.mock.callCount(),
        0,
        'disable should not be called',
      )
    })
  })
})
