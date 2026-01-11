/** biome-ignore-all lint/suspicious/noExplicitAny: The print function is overridden for mocking, easier to use any */
import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { DenvigProject } from '../project.ts'
import { generateDenvigResourceHash } from '../resources.ts'
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

  describe('getServiceLabel()', () => {
    it('should generate correct service label format', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('api')
      const expectedHash = generateDenvigResourceHash({
        project,
        resource: `service/api`,
      }).hash

      strictEqual(label, `com.denvig.${expectedHash}`)
    })

    it('should sanitize service name with special characters', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('dev:watch')
      const expectedHash = generateDenvigResourceHash({
        project,
        resource: `service/dev:watch`,
      }).hash

      strictEqual(label, `com.denvig.${expectedHash}`)
    })
  })

  describe('getPlistPath()', () => {
    it('should generate correct plist path', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('api')
      const expectedHash = generateDenvigResourceHash({
        project,
        resource: `service/api`,
      }).hash

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes(`com.denvig.${expectedHash}.plist`))
    })

    it('should sanitize special characters in plist filename', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('dev:watch')
      const expectedHash = generateDenvigResourceHash({
        project,
        resource: `service/dev:watch`,
      }).hash

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes(`com.denvig.${expectedHash}.plist`))
      ok(!path.includes(':'))
    })
  })

  describe('getLogPath()', () => {
    it('should generate correct stdout log path', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stdout')
      const expectedHash = generateDenvigResourceHash({
        project,
        resource: `service/api`,
      }).hash

      ok(path.includes('.denvig/logs'))
      ok(path.includes(`${expectedHash}.log`))
    })

    it('should generate correct stderr log path', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stderr')
      const expectedHash = generateDenvigResourceHash({
        project,
        resource: `service/api`,
      }).hash

      ok(path.includes('.denvig/logs'))
      ok(path.includes(`${expectedHash}.error.log`))
    })

    it('should sanitize special characters in log filename', () => {
      const project = new DenvigProject('my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('dev:watch', 'stdout')
      const expectedHash = generateDenvigResourceHash({
        project,
        resource: `service/dev:watch`,
      }).hash

      ok(path.includes('.denvig/logs'))
      ok(path.includes(`${expectedHash}.log`))
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

  describe('log entries on start/stop', () => {
    // These tests require mocking ES modules which isn't supported with direct assignment
    // TODO: Implement proper dependency injection or use a mocking library
    it.skip('should append a timestamped Service Started line on start', async () => {
      const project = new DenvigProject('denvig')
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

      const { hash } = generateDenvigResourceHash({
        project,
        resource: `service/test-logger`,
      })
      const home = require('node:os').homedir()
      const logPath = require('node:path').resolve(
        home,
        '.denvig',
        'logs',
        `${hash}.log`,
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
            `com.denvig.${hash}.plist`,
          ),
          { force: true },
        ),
      )
    })

    it.skip('should append a timestamped Service Stopped line on stop', async () => {
      const project = new DenvigProject('denvig')
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
      const { hash } = generateDenvigResourceHash({
        project,
        resource: `service/test-logger-stop`,
      })
      const home = require('node:os').homedir()
      const logPath = require('node:path').resolve(
        home,
        '.denvig',
        'logs',
        `${hash}.log`,
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
            `com.denvig.${hash}.plist`,
          ),
          { force: true },
        ),
      )
    })
  })
})
