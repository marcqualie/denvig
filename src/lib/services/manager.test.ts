/** biome-ignore-all lint/suspicious/noExplicitAny: The print function is overridden for mocking, easier to use any */
import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { ServiceManager } from './manager.ts'

import type { DenvigProject } from '../project.ts'

/** Create a mock project with the given slug for testing */
const createMockProject = (
  slug: string,
  path = '/tmp/test-project',
): DenvigProject =>
  ({
    slug,
    path,
    config: { name: slug, $sources: [] },
  }) as unknown as DenvigProject

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
    it('should generate correct service label format', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('api')

      strictEqual(label, 'denvig.workspace__my-app__api')
    })

    it('should sanitize service name with special characters', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('dev:watch')

      strictEqual(label, 'denvig.workspace__my-app__dev-watch')
    })

    it('should generate label with github slug format', () => {
      const project = createMockProject('github:marcqualie/denvig')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('api')

      strictEqual(label, 'denvig.github-marcqualie__denvig__api')
    })

    it('should generate label with local slug format', () => {
      const project = createMockProject('local:/Users/marc/dotfiles')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('api')

      strictEqual(label, 'denvig.local-__Users__marc__dotfiles__api')
    })
  })

  describe('getPlistPath()', () => {
    it('should generate correct plist path', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('api')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes('denvig.workspace__my-app__api.plist'))
    })

    it('should sanitize special characters in plist filename', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('dev:watch')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes('denvig.workspace__my-app__dev-watch.plist'))
      ok(!path.includes(':'))
    })
  })

  describe('getLogPath()', () => {
    it('should generate correct stdout log path', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stdout')

      ok(path.includes('.denvig/logs'))
      ok(path.includes('workspace__my-app__api.log'))
    })

    // Note: stderr is now merged with stdout via the timestamp wrapper,
    // but getLogPath still supports 'stderr' for backwards compatibility
    it('should generate correct stderr log path', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stderr')

      ok(path.includes('.denvig/logs'))
      ok(path.includes('workspace__my-app__api.error.log'))
    })

    it('should sanitize special characters in log filename', () => {
      const project = createMockProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('dev:watch', 'stdout')

      ok(path.includes('.denvig/logs'))
      ok(path.includes('workspace__my-app__dev-watch.log'))
      ok(!path.includes(':'))
    })
  })

  describe('startService() with envFiles', () => {
    it('should return error when envFile does not exist', async () => {
      const project = createMockProject(
        'github:marcqualie/denvig',
        process.cwd(),
      )

      // Set up a service with a non-existent envFile
      project.config.services = {
        'test-service-envfile': {
          command: 'echo test',
          envFiles: ['this-file-definitely-does-not-exist-12345.env'],
        },
      }

      const manager = new ServiceManager(project)
      const result = await manager.startService('test-service-envfile')

      ok(!result.success)
      ok(result.message.includes('not found'))
    })

    it('should resolve envFiles relative to service cwd', async () => {
      const project = createMockProject(
        'github:marcqualie/denvig',
        process.cwd(),
      )

      // Set up a service with cwd and an envFile that doesn't exist
      // The error should include the path relative to cwd, not project root
      project.config.services = {
        'test-service-cwd': {
          command: 'echo test',
          cwd: 'apps/api',
          envFiles: ['.env.local'],
        },
      }

      const manager = new ServiceManager(project)
      const result = await manager.startService('test-service-cwd')

      ok(!result.success)
      // The error should mention the path resolved from cwd (apps/api/.env.local)
      ok(
        result.message.includes('apps/api/.env.local'),
        `Expected error to include "apps/api/.env.local" but got: ${result.message}`,
      )
    })
  })

  describe('log entries on start/stop', () => {
    // These tests require mocking ES modules which isn't supported with direct assignment
    // TODO: Implement proper dependency injection or use a mocking library
    it.skip('should append a timestamped Service Started line on start', async () => {
      const project = createMockProject('workspace/denvig', process.cwd())
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
        'workspace__denvig__test-logger.log',
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
            'denvig.workspace__denvig__test-logger.plist',
          ),
          { force: true },
        ),
      )
    })

    it.skip('should append a timestamped Service Stopped line on stop', async () => {
      const project = createMockProject('workspace/denvig', process.cwd())
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
        'workspace__denvig__test-logger-stop.log',
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
            'denvig.workspace__denvig__test-logger-stop.plist',
          ),
          { force: true },
        ),
      )
    })
  })
})
