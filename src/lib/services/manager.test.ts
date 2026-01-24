/** biome-ignore-all lint/suspicious/noExplicitAny: The print function is overridden for mocking, easier to use any */
import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { createMockProject } from '../../test/mock.ts'
import { projectId } from '../project.ts'
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

  describe('getLogPath()', () => {
    it('should generate correct stdout log path using project ID', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stdout')

      ok(path.includes('.denvig/logs'))
      ok(path.includes(`${project.id}.api.log`))
    })

    // Note: stderr is now merged with stdout via the timestamp wrapper,
    // but getLogPath still supports 'stderr' for backwards compatibility
    it('should generate correct stderr log path using project ID', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stderr')

      ok(path.includes('.denvig/logs'))
      ok(path.includes(`${project.id}.api.error.log`))
    })

    it('should sanitize special characters in log filename', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('dev:watch', 'stdout')

      ok(path.includes('.denvig/logs'))
      ok(path.includes(`${project.id}.dev-watch.log`))
      ok(!path.includes(':'))
    })
  })

  describe('startService() with envFiles', () => {
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
      const result = await manager.startService('test-service-envfile')

      // The service should start successfully, silently skipping missing env files
      ok(
        result.success,
        `Expected service to start successfully but got: ${result.message}`,
      )
    })
  })

  describe('log entries on start/stop', () => {
    // These tests require mocking ES modules which isn't supported with direct assignment
    // TODO: Implement proper dependency injection or use a mocking library
    it.skip('should append a timestamped Service Started line on start', async () => {
      const project = createMockProject({
        slug: 'workspace/denvig',
        path: process.cwd(),
      })
      project.config.services = {
        'test-logger': {
          command: 'echo hello',
        },
      }

      const manager = new ServiceManager(project)

      // Stub launchctl to simulate successful bootstrap
      const launchctl = await import('./launchctl.ts')
      ;(launchctl as any).bootstrap = async () => ({
        success: true,
        output: '',
      })
      ;(launchctl as any).print = async () => null

      const startResult = await manager.startService('test-logger')
      ok(startResult.success)

      const home = require('node:os').homedir()
      const logPath = require('node:path').resolve(
        home,
        '.denvig',
        'logs',
        `${project.id}.test-logger.log`,
      )

      // Read the log and assert the started line exists
      const fs = await import('node:fs/promises')
      const content = await fs.readFile(logPath, 'utf-8')
      const match = content.match(
        /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\] Service Started/,
      )
      ok(match !== null)

      // Clean up
      await fs.unlink(logPath).catch(() => {})
      await import('node:fs').then((fsSync) =>
        fsSync.rmSync(
          require('node:path').resolve(
            home,
            'Library',
            'LaunchAgents',
            `denvig.${project.id}.test-logger.plist`,
          ),
          { force: true },
        ),
      )
    })

    it.skip('should append a timestamped Service Stopped line on stop', async () => {
      const project = createMockProject({
        slug: 'workspace/denvig',
        path: process.cwd(),
      })
      project.config.services = {
        'test-logger-stop': {
          command: 'echo bye',
        },
      }

      const manager = new ServiceManager(project)

      // Stub launchctl to simulate a bootstrapped service and successful bootout
      const launchctl = await import('./launchctl.ts')
      ;(launchctl as any).print = async () => ({
        label: 'loaded',
        state: 'running',
      })
      ;(launchctl as any).bootout = async () => ({ success: true, output: '' })

      // Ensure log file exists to be appended to
      const home = require('node:os').homedir()
      const logPath = require('node:path').resolve(
        home,
        '.denvig',
        'logs',
        `${project.id}.test-logger-stop.log`,
      )
      const fs = await import('node:fs/promises')
      await fs.mkdir(require('node:path').resolve(home, '.denvig', 'logs'), {
        recursive: true,
      })
      await fs.writeFile(logPath, 'initial log\n', 'utf-8')

      const stopResult = await manager.stopService('test-logger-stop')
      ok(stopResult.success)

      const content = await fs.readFile(logPath, 'utf-8')
      const match = content.match(
        /\[\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\] Service Stopped/,
      )
      ok(match !== null)

      // Clean up
      await fs.unlink(logPath).catch(() => {})
      await import('node:fs').then((fsSync) =>
        fsSync.rmSync(
          require('node:path').resolve(
            home,
            'Library',
            'LaunchAgents',
            `denvig.${project.id}.test-logger-stop.plist`,
          ),
          { force: true },
        ),
      )
    })
  })
})
