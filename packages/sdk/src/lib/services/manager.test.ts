/** biome-ignore-all lint/suspicious/noExplicitAny: The print function is overridden for mocking, easier to use any */
import { deepStrictEqual, match, ok, strictEqual } from 'node:assert'
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { type AddressInfo, createServer } from 'node:net'
import { hostname, tmpdir } from 'node:os'
import { resolve } from 'node:path'
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

/** Bind an ephemeral TCP port and return it with a release callback. */
const occupyPort = async (): Promise<{
  port: number
  release: () => Promise<void>
}> => {
  const server = createServer()
  await new Promise<void>((res) => server.listen(0, res))
  const port = (server.address() as AddressInfo).port
  return {
    port,
    release: () => new Promise<void>((res) => server.close(() => res())),
  }
}

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

  describe('pruneOldLogFiles()', () => {
    it('should keep only the 10 most recent log files and preserve symlinks', async () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const logDir = mkdtempSync(resolve(tmpdir(), 'denvig-prune-'))
      try {
        // Create 15 timestamped log files
        const timestamps = Array.from({ length: 15 }, (_, i) => 1700000000 + i)
        for (const ts of timestamps) {
          writeFileSync(resolve(logDir, `${ts}.log`), '')
        }
        // Symlinks should always be preserved regardless of count
        symlinkSync('1700000014.log', resolve(logDir, 'latest.log'))
        symlinkSync(
          '1700000014.log',
          resolve(logDir, `latest.${hostname()}.log`),
        )

        await (manager as any).pruneOldLogFiles(logDir)

        const remaining = readdirSync(logDir)
        const logFiles = remaining
          .filter((name) => /^\d+\.log$/.test(name))
          .sort()
        strictEqual(logFiles.length, 10, 'should keep 10 timestamped logs')
        strictEqual(logFiles[0], '1700000005.log', 'should keep newest 10')
        strictEqual(logFiles[9], '1700000014.log')

        ok(remaining.includes('latest.log'), 'latest.log preserved')
        ok(
          remaining.includes(`latest.${hostname()}.log`),
          'host symlink preserved',
        )
      } finally {
        rmSync(logDir, { recursive: true, force: true })
      }
    })

    it('should leave files untouched when fewer than the limit exist', async () => {
      const project = createMockInternalProject('workspace/my-app')
      const manager = new ServiceManager(project)

      const logDir = mkdtempSync(resolve(tmpdir(), 'denvig-prune-'))
      try {
        for (const ts of [1700000000, 1700000001, 1700000002]) {
          writeFileSync(resolve(logDir, `${ts}.log`), '')
        }

        await (manager as any).pruneOldLogFiles(logDir)

        const logFiles = readdirSync(logDir).filter((name) =>
          /^\d+\.log$/.test(name),
        )
        strictEqual(logFiles.length, 3)
      } finally {
        rmSync(logDir, { recursive: true, force: true })
      }
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

    it('returns no port for a non-http service even with port "random"', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        worker: { command: 'node worker.js' },
      }
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('worker', {
        port: 'random',
      })

      ok(resolved.success)
      strictEqual(resolved.port, undefined)
    })

    it('allocates a random port when port is "random"', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: { port: 4000 } },
      }
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('web', {
        port: 'random',
      })

      ok(resolved.success)
      strictEqual(resolved.source, 'allocated')
      strictEqual(resolved.conflict, false)
      ok(resolved.port !== undefined && resolved.port !== 4000)
    })

    it('uses a requested port when it is free', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: { port: 4000 } },
      }
      const manager = new ServiceManager(project)

      const resolved = await manager.resolveServicePort('web', { port: 8456 })

      ok(resolved.success)
      strictEqual(resolved.port, 8456)
      strictEqual(resolved.source, 'requested')
      strictEqual(resolved.conflict, false)
    })

    it('falls back to a random port when the requested port is in use', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: { port: 4000 } },
      }
      const manager = new ServiceManager(project)
      const busy = await occupyPort()
      try {
        const resolved = await manager.resolveServicePort('web', {
          port: busy.port,
        })

        ok(resolved.success)
        strictEqual(resolved.source, 'allocated')
        strictEqual(resolved.conflict, true)
        strictEqual(resolved.configPort, busy.port)
        ok(resolved.port !== undefined && resolved.port !== busy.port)
      } finally {
        await busy.release()
      }
    })

    it('keeps a requested port this service already holds (mid-restart)', async () => {
      const project = createMockInternalProject({ path: '/tmp/test-ports' })
      project.config.services = {
        web: { command: 'node server.js', http: { port: 4000 } },
      }
      const busy = await occupyPort()
      // State records the port and the port reads as in use — but it's this
      // service's own, so it must be kept rather than swapped for a random one.
      await updateServiceState(project.id, 'web', {
        cwd: project.path,
        port: busy.port,
        domains: [],
        desiredStatus: 'running',
      })
      const manager = new ServiceManager(project)
      try {
        const resolved = await manager.resolveServicePort('web', {
          port: busy.port,
        })

        ok(resolved.success)
        strictEqual(resolved.port, busy.port)
        strictEqual(resolved.source, 'requested')
        strictEqual(resolved.conflict, false)
      } finally {
        await busy.release()
      }
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

    it('claims the configured domain even when another running service owns it', async (t) => {
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

      // The worktree start takes the configured domain over unconditionally.
      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, worktree.id)
      strictEqual(route?.service, 'hello')
      strictEqual(route?.port, 9001)
      strictEqual(route?.desiredStatus, 'running')
      strictEqual(
        await manager.getServiceUrl('hello'),
        'http://hello.denvig.me',
      )
    })

    it('routes an explicit domain set, leaving the configured domain untouched', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        domains: ['hello-feature-x.denvig.me'],
      })
      ok(result.success, result.message)

      // The configured domain stays with the original service.
      const configured = await getGatewayRoute('hello.denvig.me')
      strictEqual(configured?.project, original.id)
      strictEqual(configured?.desiredStatus, 'running')

      // The explicit domain routes to the worktree start.
      const explicit = await getGatewayRoute('hello-feature-x.denvig.me')
      strictEqual(explicit?.project, worktree.id)
      strictEqual(explicit?.service, 'hello')
      strictEqual(explicit?.port, 9001)
      const state = await getServiceState(worktree.id, 'hello')
      strictEqual(state?.domains?.[0], 'hello-feature-x.denvig.me')
      strictEqual(
        await manager.getServiceUrl('hello'),
        'http://hello-feature-x.denvig.me',
      )
    })

    it('claims an explicit domain from another running service', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        domains: ['hello.denvig.me'],
      })
      ok(result.success, result.message)

      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, worktree.id)
      strictEqual(route?.port, 9001)
      strictEqual(
        await manager.getServiceUrl('hello'),
        'http://hello.denvig.me',
      )
    })

    it('claims nothing when started with an empty domains array', async (t) => {
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        domains: [],
      })
      ok(result.success, result.message)

      // The desired state records the empty claim verbatim so the reconciler
      // keeps re-applying "no domains".
      const state = await getServiceState(worktree.id, 'hello')
      deepStrictEqual(state?.domains, [])

      // No gateway route was registered for the configured domain.
      strictEqual(await getGatewayRoute('hello.denvig.me'), null)

      // The canonical URL falls back to the localhost form.
      strictEqual(await manager.getServiceUrl('hello'), 'http://localhost:9001')
    })

    it('does not steal a domain owned by another running service when started with []', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        domains: [],
      })
      ok(result.success, result.message)

      // The original service keeps ownership of the configured domain.
      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, original.id)
      strictEqual(route?.port, 8080)
      strictEqual(route?.desiredStatus, 'running')

      // The worktree start runs on its port only.
      strictEqual(await manager.getServiceUrl('hello'), 'http://localhost:9001')
    })

    it('claims the configured domain when started with omitted domains', async (t) => {
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
      })
      ok(result.success, result.message)

      const state = await getServiceState(worktree.id, 'hello')
      deepStrictEqual(state?.domains, ['hello.denvig.me'])
      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, worktree.id)
      strictEqual(route?.port, 9001)
      strictEqual(
        await manager.getServiceUrl('hello'),
        'http://hello.denvig.me',
      )
    })

    it('updates routes without restarting an already-running service', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)

      // Initial start lays down the plist and state.
      mockLaunchctlStart(t)
      await manager.startService('hello', { port: 9001, portResolved: true })

      // Re-run while the service is live. The process must be left untouched
      // (no bootout/bootstrap) and only the gateway route moves.
      t.mock.restoreAll()
      t.mock.method(launchctl, 'print', async () => ({
        label: 'test',
        pid: 123,
        state: 'running',
        status: 'running',
      }))
      const bootout = t.mock.method(launchctl, 'bootout', async () => ({
        success: true,
        output: '',
      }))
      const bootstrap = t.mock.method(launchctl, 'bootstrap', async () => ({
        success: true,
        output: '',
      }))
      t.mock.method(launchctl, 'enable', async () => ({
        success: true,
        output: '',
      }))

      const result = await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        domains: ['hello.denvig.me'],
      })
      ok(result.success, result.message)
      strictEqual(
        bootout.mock.callCount(),
        0,
        'should not bootout a live service',
      )
      strictEqual(
        bootstrap.mock.callCount(),
        0,
        'should not bootstrap a live service',
      )

      // The route move still takes effect.
      const route = await getGatewayRoute('hello.denvig.me')
      strictEqual(route?.project, worktree.id)
      strictEqual(route?.port, 9001)
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
        domains: ['hello.denvig.me'],
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

    it('restart keeps an explicit domain routed', async (t) => {
      const original = createOriginalProject()
      await seedRunningOriginal(original)
      const worktree = createWorktreeProject()
      const manager = new ServiceManager(worktree)
      mockLaunchctlStart(t)
      await manager.startService('hello', {
        port: 9001,
        portResolved: true,
        domains: ['hello-feature-x.denvig.me'],
      })

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
        domains: ['hello-feature-x.denvig.me'],
      })
      ok(result.success, result.message)

      const explicit = await getGatewayRoute('hello-feature-x.denvig.me')
      strictEqual(explicit?.project, worktree.id)
      strictEqual(explicit?.desiredStatus, 'running')
      const state = await getServiceState(worktree.id, 'hello')
      strictEqual(state?.domains?.[0], 'hello-feature-x.denvig.me')
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

  describe('docker runtime', () => {
    let originalHome: string | undefined
    let tmpHome = ''

    beforeEach(() => {
      originalHome = process.env.HOME
      tmpHome = mkdtempSync(`${tmpdir()}/denvig-manager-docker-`)
      process.env.HOME = tmpHome
      mkdirSync(`${tmpHome}/Library/LaunchAgents`, { recursive: true })
    })
    afterEach(() => {
      if (originalHome !== undefined) process.env.HOME = originalHome
      else delete process.env.HOME
      rmSync(tmpHome, { recursive: true, force: true })
    })

    const createDockerProject = (service: any) => {
      const project = createMockInternalProject({
        slug: 'github:owner/repo',
        path: `${tmpHome}/repo`,
      })
      project.config.services = { svc: service }
      return project
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

    it('summarises the image in the display command', async () => {
      const manager = new ServiceManager(
        createDockerProject({ runtime: 'docker', image: 'redis:8.8' }),
      )
      const services = await manager.listServices()
      strictEqual(services[0]?.command, 'docker run redis:8.8')
    })

    it('mounts the project and runs a container via the wrapper script', async (t) => {
      mockLaunchctlStart(t)
      const project = createDockerProject({
        runtime: 'docker',
        image: 'redis:8.8',
        http: { port: 16379, containerPort: 6379 },
      })
      const manager = new ServiceManager(project)

      const result = await manager.startService('svc', {
        port: 16379,
        portResolved: true,
      })
      ok(result.success, result.message)

      const script = readFileSync(manager.getServiceScriptPath('svc'), 'utf-8')
      ok(script.includes('docker run --rm --init --name'))
      // This temp project isn't a git checkout, so the project root is the
      // project path and the working directory is the mount root.
      ok(script.includes(`-v "${project.path}:/denvig/project"`))
      ok(script.includes('-w /denvig/project'))
      ok(script.includes('-p 16379:6379'))
      ok(script.includes('redis:8.8'))

      // The host port is what the gateway/state sees, not the container port.
      const state = await getServiceState(project.id, 'svc')
      strictEqual(state?.port, 16379)
      strictEqual(state?.config?.runtime, 'docker')
      strictEqual(state?.config?.image, 'redis:8.8')
      strictEqual(state?.config?.command, undefined)
    })

    it('does not mount the project when mountProject is false', async (t) => {
      mockLaunchctlStart(t)
      const project = createDockerProject({
        runtime: 'docker',
        image: 'redis:8.8',
        container: { mountProject: false },
        http: { port: 16379, containerPort: 6379 },
      })
      const manager = new ServiceManager(project)

      const result = await manager.startService('svc', {
        port: 16379,
        portResolved: true,
      })
      ok(result.success, result.message)

      const script = readFileSync(manager.getServiceScriptPath('svc'), 'utf-8')
      ok(!script.includes('/denvig/project'), 'project should not be mounted')
      ok(!script.includes('-w '), 'no working directory should be set')
      ok(script.includes('-p 16379:6379'))
    })

    it('sets the working directory to a nested service cwd', async (t) => {
      mockLaunchctlStart(t)
      const project = createDockerProject({
        runtime: 'docker',
        image: 'node:22-alpine',
        cwd: 'apps/api',
        command: 'node server.js',
      })
      mkdirSync(`${project.path}/apps/api`, { recursive: true })
      const manager = new ServiceManager(project)

      const result = await manager.startService('svc', { portResolved: true })
      ok(result.success, result.message)

      const script = readFileSync(manager.getServiceScriptPath('svc'), 'utf-8')
      ok(script.includes(`-v "${project.path}:/denvig/project"`))
      ok(script.includes('-w /denvig/project/apps/api'))
    })

    it('fails when the service directory is outside the project root', async (t) => {
      mockLaunchctlStart(t)
      const project = createDockerProject({
        runtime: 'docker',
        image: 'redis:8.8',
        cwd: '../outside',
      })
      const manager = new ServiceManager(project)

      const result = await manager.startService('svc', { portResolved: true })
      strictEqual(result.success, false)
      match(result.message, /not inside the project root/)
    })

    it('mounts container.volumes, resolving relative host paths', async (t) => {
      mockLaunchctlStart(t)
      const project = createDockerProject({
        runtime: 'docker',
        image: 'nginx:1.27',
        container: {
          mountProject: false,
          volumes: [
            './nginx/nginx.conf:/etc/nginx/nginx.conf',
            '/abs/certs:/etc/nginx/certs:ro',
            'named-vol:/data',
          ],
          ports: ['80:80', '443:443'],
        },
      })
      const manager = new ServiceManager(project)

      const result = await manager.startService('svc', { portResolved: true })
      ok(result.success, result.message)

      const script = readFileSync(manager.getServiceScriptPath('svc'), 'utf-8')
      // Relative host path resolves against the service directory.
      ok(
        script.includes(
          `-v "${project.path}/nginx/nginx.conf:/etc/nginx/nginx.conf"`,
        ),
        script,
      )
      // Absolute host path and options are preserved.
      ok(script.includes('-v "/abs/certs:/etc/nginx/certs:ro"'))
      // Named volume is left untouched.
      ok(script.includes('-v "named-vol:/data"'))
      // Extra published ports are passed through.
      ok(script.includes('-p 80:80'))
      ok(script.includes('-p 443:443'))
    })
  })
})
