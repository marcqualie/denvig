/** biome-ignore-all lint/suspicious/noExplicitAny: The print function is overridden for mocking, easier to use any */
import { ok, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { hostname, tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { createMockInternalProject } from '../../test/mock.ts'
import launchctl from './launchctl.ts'
import { ServiceManager, type ServiceManagerProject } from './manager.ts'
import {
  getGatewayRoute,
  getServiceState,
  setGatewayRoute,
  updateServiceState,
} from './state.ts'

describe('ServiceManager', () => {
  describe('listServices()', () => {
    it('should return empty array when no services configured', async () => {
      const project = createMockInternalProject('test-project')
      const manager = new ServiceManager(project)
      const services = await manager.listServices()

      ok(Array.isArray(services))
    })
  })

  describe('getServiceLabel()', () => {
    it('should generate correct service label format using project ID', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('api')

      // Label format: denvig.[projectId].[serviceName]
      strictEqual(label, `denvig.${project.id}.api`)
    })

    it('should sanitize service name with special characters', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const label = manager.getServiceLabel('dev:watch')

      strictEqual(label, `denvig.${project.id}.dev-watch`)
    })

    it('should generate same label format regardless of slug format', () => {
      const project1 = createMockInternalProject('github:marcqualie/denvig')
      const project2 = createMockInternalProject('local:/Users/marc/dotfiles')
      const manager1 = new ServiceManager(project1)
      const manager2 = new ServiceManager(project2)

      // Both should use the same format: denvig.[id].[service]
      strictEqual(manager1.getServiceLabel('api'), `denvig.${project1.id}.api`)
      strictEqual(manager2.getServiceLabel('api'), `denvig.${project2.id}.api`)
    })
  })

  describe('getPlistPath()', () => {
    it('should generate correct plist path using project ID', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('api')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes(`denvig.${project.id}.api.plist`))
    })

    it('should sanitize special characters in plist filename', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getPlistPath('dev:watch')

      ok(path.includes('Library/LaunchAgents'))
      ok(path.includes(`denvig.${project.id}.dev-watch.plist`))
      ok(!path.includes(':'))
    })
  })

  describe('getServiceDir()', () => {
    it('should generate correct service directory path', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const dir = manager.getServiceDir('api')

      ok(dir.includes(`.denvig/services/${project.id}.api`))
      ok(!dir.includes('/logs'))
    })
  })

  describe('getServiceScriptPath()', () => {
    it('should include github slug in script filename', () => {
      const project = createMockInternalProject({
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
      const project = createMockInternalProject({
        slug: 'local:/Users/marc/my-app',
      })
      const manager = new ServiceManager(project)

      const path = manager.getServiceScriptPath('api')

      ok(path.endsWith('/denvig-api'))
      ok(!path.includes('local'))
    })

    it('should sanitize special characters in script filename', () => {
      const project = createMockInternalProject({
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
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const dir = manager.getServiceLogDir('api')

      ok(dir.includes(`.denvig/services/${project.id}.api/logs`))
    })
  })

  describe('getStableLogPath()', () => {
    it('should return latest.log under service log dir', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getStableLogPath('api')

      ok(path.includes(`.denvig/services/${project.id}.api/logs`))
      ok(path.endsWith('/latest.log'))
    })
  })

  describe('getLogPath()', () => {
    it('should generate symlink path with hostname under service log dir', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api')

      ok(path.includes(`.denvig/services/${project.id}.api/logs`))
      ok(path.includes(`latest.${hostname()}.log`))
    })

    it('should accept optional type parameter for backward compatibility', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('api', 'stdout')

      ok(path.includes(`latest.${hostname()}.log`))
    })

    it('should sanitize special characters in log path', () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const path = manager.getLogPath('dev:watch')

      ok(path.includes(`.denvig/services/${project.id}.dev-watch/logs`))
      ok(path.includes(`latest.${hostname()}.log`))
      ok(!path.includes(':'))
    })
  })

  describe('buildServiceEnvironment()', () => {
    it('should skip missing env files when explicitly specified', async () => {
      const project = createMockInternalProject({
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

  describe('resolveServicePort()', () => {
    let originalHome: string | undefined
    let tmpHome = ''

    beforeEach(() => {
      originalHome = process.env.HOME
      tmpHome = mkdtempSync(`${tmpdir()}/denvig-manager-ports-`)
      process.env.HOME = tmpHome
    })
    afterEach(() => {
      if (originalHome !== undefined) process.env.HOME = originalHome
      else delete process.env.HOME
      rmSync(tmpHome, { recursive: true, force: true })
    })

    it('returns no port for a service without an http block', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        worker: { command: 'node worker.js' },
      }
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('worker')

      ok(resolved.success)
      strictEqual(resolved.port, undefined)
      strictEqual(resolved.source, 'none')
      strictEqual(resolved.conflict, false)
    })

    it('returns no port for a non-http service even with forceRandom', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        worker: { command: 'node worker.js' },
      }
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('worker', {
        forceRandom: true,
      })

      ok(resolved.success)
      strictEqual(resolved.port, undefined)
    })

    it('ignores a stale state port for a non-http service', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        worker: { command: 'node worker.js' },
      }
      await updateServiceState(project.id, 'worker', {
        cwd: project.path,
        port: 8123,
        domains: [],
        desiredStatus: 'running',
      })
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('worker')

      ok(resolved.success)
      strictEqual(resolved.port, undefined)
    })

    it('allocates a random port for a service with an http block but no port', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: {} },
      }
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('web')

      ok(resolved.success)
      strictEqual(resolved.source, 'allocated')
      ok(
        resolved.port !== undefined &&
          resolved.port >= 8000 &&
          resolved.port <= 9999,
      )
    })

    it('reuses the state port for an http service', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: {} },
      }
      await updateServiceState(project.id, 'web', {
        cwd: project.path,
        port: 8123,
        domains: [],
        desiredStatus: 'running',
      })
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('web')

      ok(resolved.success)
      strictEqual(resolved.port, 8123)
      strictEqual(resolved.source, 'state')
    })
  })

  describe('getEffectivePort()', () => {
    let originalHome: string | undefined
    let tmpHome = ''

    beforeEach(() => {
      originalHome = process.env.HOME
      tmpHome = mkdtempSync(`${tmpdir()}/denvig-manager-ports-`)
      process.env.HOME = tmpHome
    })
    afterEach(() => {
      if (originalHome !== undefined) process.env.HOME = originalHome
      else delete process.env.HOME
      rmSync(tmpHome, { recursive: true, force: true })
    })

    it('returns undefined for a non-http service even when state has a port', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        worker: { command: 'node worker.js' },
      }
      await updateServiceState(project.id, 'worker', {
        cwd: project.path,
        port: 8123,
        domains: [],
        desiredStatus: 'running',
      })
      const manager = new ServiceManager(project)

      strictEqual(await manager.getEffectivePort('worker'), undefined)
      strictEqual(await manager.getServiceLocalUrl('worker'), null)
    })

    it('returns the state port for an http service', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: { port: 4000 } },
      }
      await updateServiceState(project.id, 'web', {
        cwd: project.path,
        port: 8123,
        domains: [],
        desiredStatus: 'running',
      })
      const manager = new ServiceManager(project)

      strictEqual(await manager.getEffectivePort('web'), 8123)
    })

    it('falls back to the config port for an http service without state', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: { port: 4000 } },
      }
      const manager = new ServiceManager(project)

      strictEqual(await manager.getEffectivePort('web'), 4000)
    })
  })

  describe('gateway domain mapping', () => {
    let originalHome: string | undefined
    let tmpHome = ''

    beforeEach(() => {
      originalHome = process.env.HOME
      tmpHome = mkdtempSync(`${tmpdir()}/denvig-manager-domains-`)
      process.env.HOME = tmpHome
      mkdirSync(`${tmpHome}/Library/LaunchAgents`, { recursive: true })
    })
    afterEach(() => {
      if (originalHome !== undefined) process.env.HOME = originalHome
      else delete process.env.HOME
      rmSync(tmpHome, { recursive: true, force: true })
    })

    const httpServiceConfig = {
      command: 'node server.js',
      http: { domain: 'hello.denvig.me' },
    }

    /** Project whose `hello` service naturally owns hello.denvig.me. */
    const createOriginalProject = () => {
      const project = createMockInternalProject({
        slug: 'github:owner/repo',
        path: `${tmpHome}/repo`,
      })
      project.config.services = { hello: { ...httpServiceConfig } }
      return project
    }

    /** Sibling worktree checkout declaring the same service + domain. */
    const createWorktreeProject = () => {
      const project = createMockInternalProject({
        slug: 'github:owner/repo',
        path: `${tmpHome}/worktrees/feature-x`,
      })
      project.config.services = { hello: { ...httpServiceConfig } }
      return project
    }

    /** Record the original project's service as running and owning the domain. */
    const seedRunningOriginal = async (project: ServiceManagerProject) => {
      await updateServiceState(project.id, 'hello', {
        cwd: project.path,
        port: 8080,
        domains: ['hello.denvig.me'],
        desiredStatus: 'running',
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name,
          path: project.path,
        },
        serviceName: 'hello',
      })
      await setGatewayRoute('hello.denvig.me', {
        project: project.id,
        service: 'hello',
        port: 8080,
        secure: false,
        defaultService: true,
        desiredStatus: 'running',
      })
    }

    const mockLaunchctlStart = (t: any) => {
      t.mock.method(launchctl, 'print', async () => null)
      t.mock.method(launchctl, 'enable', async () => ({
        success: true,
        output: '',
      }))
      t.mock.method(launchctl, 'bootstrap', async () => ({
        success: true,
        output: '',
      }))
    }

    const mockLaunchctlStop = (t: any, manager: ServiceManager) => {
      t.mock.method(launchctl, 'print', async () => ({
        label: 'test',
        pid: 123,
        state: 'running',
        status: 'running',
      }))
      t.mock.method(launchctl, 'bootout', async () => ({
        success: true,
        output: '',
      }))
      t.mock.method(launchctl, 'disable', async () => ({
        success: true,
        output: '',
      }))
      t.mock.method(manager, 'reconfigureGateway' as any, async () => {})
    }

    it('starts on a dynamic domain when the configured domain is owned by another running service', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
      })
      ok(result.success, result.message)

      // The original keeps its domain untouched.
      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, original.id)
      strictEqual(route?.desiredStatus, 'running')

      // The worktree start is routed on a dynamically assigned domain.
      const state = await getServiceState(worktree.id, 'hello')
      strictEqual(state?.dynamicDomain, 'hello-feature-x.denvig.me')
      const dynamicRoute = await getGatewayRoute('hello-feature-x.denvig.me')
      strictEqual(dynamicRoute?.project, worktree.id)
      strictEqual(dynamicRoute?.service, 'hello')
      strictEqual(dynamicRoute?.port, 9001)
      strictEqual(dynamicRoute?.temporary, true)
      strictEqual(dynamicRoute?.defaultService, false)
      strictEqual(
        await manager.getServiceUrl('hello'),
        'http://hello-feature-x.denvig.me',
      )
    })

    it('reuses the dynamic domain recorded in state on subsequent starts', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      await updateServiceState(worktree.id, 'hello', {
        cwd: worktree.path,
        dynamicDomain: 'hello-custom.denvig.me',
        domains: ['hello.denvig.me'],
        desiredStatus: 'stopped',
      })
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
      })
      ok(result.success, result.message)

      const dynamicRoute = await getGatewayRoute('hello-custom.denvig.me')
      strictEqual(dynamicRoute?.project, worktree.id)
      strictEqual(dynamicRoute?.temporary, true)
      strictEqual(
        await getGatewayRoute('hello-feature-x.denvig.me'),
        null,
        'no new dynamic domain should be generated',
      )
    })

    it('moves the domain to this start when claimDomain is true', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        claimDomain: true,
      })
      ok(result.success, result.message)

      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, worktree.id)
      strictEqual(route?.port, 9001)
      strictEqual(route?.defaultService, false)
      strictEqual(
        await manager.getServiceUrl('hello'),
        'http://hello.denvig.me',
      )
    })

    it('stop removes the temporary domain and keeps it in state for the next start', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)
      await manager.startService('hello', { port: 9001, portResolved: true })

      t.mock.restoreAll()
      mockLaunchctlStop(t, manager)
      const result = await manager.stopService('hello')
      ok(result.success, result.message)

      strictEqual(await getGatewayRoute('hello-feature-x.denvig.me'), null)
      const state = await getServiceState(worktree.id, 'hello')
      strictEqual(state?.dynamicDomain, 'hello-feature-x.denvig.me')
      strictEqual(state?.desiredStatus, 'stopped')
    })

    it('stop hands a claimed domain back to the original running service', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)
      await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        claimDomain: true,
      })

      t.mock.restoreAll()
      mockLaunchctlStop(t, manager)
      const result = await manager.stopService('hello')
      ok(result.success, result.message)

      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, original.id)
      strictEqual(route?.service, 'hello')
      strictEqual(route?.port, 8080)
      strictEqual(route?.desiredStatus, 'running')
      strictEqual(route?.defaultService, true)
    })

    it('restart keeps the dynamic domain routed', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)
      await manager.startService('hello', { port: 9001, portResolved: true })

      t.mock.restoreAll()
      t.mock.method(launchctl, 'print', async () => ({
        label: 'test',
        pid: 123,
        state: 'running',
        status: 'running',
      }))
      for (const method of ['enable', 'bootstrap', 'bootout', 'disable']) {
        t.mock.method(launchctl, method as any, async () => ({
          success: true,
          output: '',
        }))
      }
      t.mock.method(manager, 'reconfigureGateway' as any, async () => {})

      const result = await manager.restartService('hello', {
        port: 9001,
        portResolved: true,
      })
      ok(result.success, result.message)

      const dynamicRoute = await getGatewayRoute('hello-feature-x.denvig.me')
      strictEqual(dynamicRoute?.project, worktree.id)
      strictEqual(dynamicRoute?.desiredStatus, 'running')
      const state = await getServiceState(worktree.id, 'hello')
      strictEqual(state?.dynamicDomain, 'hello-feature-x.denvig.me')
    })

    it('removes a stale temporary route once the configured domain is free again', async (t) => {
      const worktree = createWorktreeProject()
      await updateServiceState(worktree.id, 'hello', {
        cwd: worktree.path,
        dynamicDomain: 'hello-feature-x.denvig.me',
        domains: ['hello.denvig.me'],
        desiredStatus: 'stopped',
      })
      await setGatewayRoute('hello-feature-x.denvig.me', {
        project: worktree.id,
        service: 'hello',
        port: 9001,
        secure: false,
        defaultService: false,
        desiredStatus: 'stopped',
        temporary: true,
      })
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
      })
      ok(result.success, result.message)

      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, worktree.id)
      strictEqual(await getGatewayRoute('hello-feature-x.denvig.me'), null)
    })
  })

  describe('stopService() launchctl behavior', () => {
    it('should call bootout and disable for regular services', async (t) => {
      const project = createMockInternalProject({
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
      const project = createMockInternalProject({
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
