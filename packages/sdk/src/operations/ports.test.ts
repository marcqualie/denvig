import { deepStrictEqual, ok, strictEqual, throws } from 'node:assert'
import { describe, it } from 'node:test'

import { DenvigOperationError, DenvigValidationError } from '../lib/errors.ts'
import { parseProcessTable } from '../lib/system/ports.ts'
import {
  assertKillable,
  bindingAcceptsHost,
  buildGatewayDomainRoutes,
  buildServiceCandidates,
  dockerHostPort,
  type GatewayDomainRoute,
  type PortInfo,
  resolvePorts,
  type ServiceCandidate,
  type SystemPort,
} from './ports.ts'

import type { DenvigState } from '../lib/services/state.ts'
import type { RawListener } from '../lib/system/ports.ts'

const PROJECT_ID = 'abc123'

const listener = (overrides: Partial<RawListener>): RawListener => ({
  port: 3000,
  address: '*',
  family: 'IPv4',
  pid: 100,
  name: 'node',
  user: 'user',
  ...overrides,
})

const candidate = (overrides: Partial<ServiceCandidate>): ServiceCandidate => ({
  projectId: PROJECT_ID,
  projectSlug: 'github:owner/repo',
  serviceName: 'api',
  identifier: 'github:owner/repo/api',
  status: 'running',
  runtime: 'host',
  ports: [],
  pids: [],
  ...overrides,
})

const processes = parseProcessTable(
  [
    '1 0 root launchd',
    '10 1 user /bin/zsh',
    '20 10 user pnpm dev',
    '100 20 user node server.js',
    '101 100 user node worker.js',
    '200 1 user node orphan.js',
    '300 1 user com.docker.backend',
    '400 1 user redis-server',
  ].join('\n'),
)

const resolve = (
  listeners: RawListener[],
  candidates: ServiceCandidate[] = [],
  routes: GatewayDomainRoute[] = [],
) => resolvePorts({ listeners, processes, candidates, routes, interfaces: {} })

describe('dockerHostPort()', () => {
  it('extracts the host port from docker mappings', () => {
    strictEqual(dockerHostPort('5432:5432'), 5432)
    strictEqual(dockerHostPort('127.0.0.1:6380:6379'), 6380)
    strictEqual(dockerHostPort('8080:80/tcp'), 8080)
    strictEqual(dockerHostPort('80'), null)
  })
})

describe('buildServiceCandidates()', () => {
  it('combines state ports with service manager pids', () => {
    const state: DenvigState = {
      services: {
        [`id:${PROJECT_ID}:api`]: {
          cwd: '/tmp/example-project',
          port: 8123,
          domains: [],
          desiredStatus: 'running',
          project: {
            id: PROJECT_ID,
            slug: 'github:owner/repo',
            name: 'repo',
            path: '/tmp/example-project',
          },
          serviceName: 'api',
          config: { http: { port: 3000 } },
        },
        [`id:${PROJECT_ID}:db`]: {
          cwd: '/tmp/example-project',
          domains: [],
          desiredStatus: 'running',
          serviceName: 'db',
          config: { runtime: 'docker', container: { ports: ['5432:5432'] } },
        },
      },
      gatewayRoutes: {},
      certs: {},
    }
    const candidates = buildServiceCandidates(state, [
      { pid: 10, status: 0, label: `denvig.${PROJECT_ID}.api` },
      { pid: 50, status: 0, label: 'denvig.def456.legacy' },
      { pid: '-', status: 0, label: 'denvig.def456.stopped' },
    ])

    deepStrictEqual(candidates, [
      {
        projectId: PROJECT_ID,
        projectSlug: 'github:owner/repo',
        serviceName: 'api',
        identifier: 'github:owner/repo/api',
        status: 'running',
        runtime: 'host',
        ports: [8123, 3000],
        pids: [10],
      },
      {
        projectId: PROJECT_ID,
        projectSlug: null,
        serviceName: 'db',
        identifier: `id:${PROJECT_ID}/db`,
        status: 'running',
        runtime: 'docker',
        ports: [5432],
        pids: [],
      },
      {
        projectId: 'def456',
        projectSlug: null,
        serviceName: 'legacy',
        identifier: 'id:def456/legacy',
        status: 'running',
        runtime: 'host',
        ports: [],
        pids: [50],
      },
    ])
  })

  it('uses the global identifier for global services', () => {
    const state: DenvigState = {
      services: {
        'id:fff:redis': {
          cwd: '/tmp',
          domains: [],
          desiredStatus: 'stopped',
          project: { id: 'fff', slug: 'global', name: 'global', path: '/tmp' },
          serviceName: 'redis',
        },
      },
      gatewayRoutes: {},
      certs: {},
    }
    const [service] = buildServiceCandidates(state, [])
    strictEqual(service.identifier, 'global:redis')
    strictEqual(service.status, 'stopped')
  })
})

describe('resolvePorts()', () => {
  it('links listeners to services through the process tree', () => {
    const [port] = resolve(
      [listener({ port: 3000, pid: 100 })],
      [candidate({ pids: [10], ports: [3000] })],
    )
    strictEqual(port.service?.identifier, 'github:owner/repo/api')
    strictEqual(port.service?.via, 'process')
    deepStrictEqual(port.conflicts, [])
  })

  it('flags orphaned processes holding a service port as conflicts', () => {
    const [port] = resolve(
      [listener({ port: 3000, pid: 200 })],
      [candidate({ pids: [10], ports: [3000] })],
    )
    strictEqual(port.service, null)
    deepStrictEqual(
      port.conflicts.map((c) => c.identifier),
      ['github:owner/repo/api'],
    )
  })

  it('attributes container runtime listeners to docker services by port', () => {
    const db = candidate({
      serviceName: 'db',
      identifier: 'github:owner/repo/db',
      runtime: 'docker',
      ports: [6379],
    })
    const ports = resolve(
      [
        listener({
          port: 6379,
          pid: 300,
          name: 'com.docker.backend',
          family: 'IPv6',
        }),
        listener({
          port: 6379,
          pid: 400,
          name: 'redis-server',
          address: '127.0.0.1',
        }),
      ],
      [db],
    )
    const docker = ports.find((p) => p.process?.pid === 300) as SystemPort
    const local = ports.find((p) => p.process?.pid === 400) as SystemPort
    strictEqual(docker.service?.via, 'config')
    strictEqual(local.service, null)
    deepStrictEqual(
      local.conflicts.map((c) => c.serviceName),
      ['db'],
    )
  })

  it('merges bindings and pre-forked workers into one entry', () => {
    const ports = resolve(
      [
        listener({ port: 80, pid: 100, address: '*', family: 'IPv4' }),
        listener({ port: 80, pid: 100, address: '*', family: 'IPv6' }),
        listener({ port: 80, pid: 101, address: '*', family: 'IPv4' }),
      ],
      [],
    )
    strictEqual(ports.length, 1)
    deepStrictEqual(ports[0].pids, [100, 101])
    strictEqual(ports[0].process?.pid, 100)
    strictEqual(ports[0].process?.command, 'node server.js')
    deepStrictEqual(
      ports[0].bindings.map((b) => `${b.family}:${b.address}`),
      ['IPv4:*', 'IPv6:*'],
    )
    strictEqual(ports[0].scope, 'all')
  })

  it('reports the widest scope across bindings', () => {
    const [port] = resolve(
      [
        listener({ port: 5432, address: '127.0.0.1' }),
        listener({ port: 5432, address: '192.168.1.10' }),
      ],
      [],
    )
    strictEqual(port.scope, 'network')
  })

  it('keeps listeners with hidden owners', () => {
    const [port] = resolve(
      [listener({ port: 22, pid: null, name: null, user: null })],
      [],
    )
    strictEqual(port.process, null)
    deepStrictEqual(port.pids, [])
  })
})

describe('bindingAcceptsHost()', () => {
  it('matches exact addresses and wildcards of the same family', () => {
    ok(
      bindingAcceptsHost({ address: '127.0.0.1', family: 'IPv4' }, '127.0.0.1'),
    )
    ok(bindingAcceptsHost({ address: '*', family: 'IPv4' }, '127.0.0.1'))
    ok(bindingAcceptsHost({ address: '::1', family: 'IPv6' }, '[::1]'))
    ok(!bindingAcceptsHost({ address: '127.0.0.1', family: 'IPv4' }, '::1'))
    ok(!bindingAcceptsHost({ address: '*', family: 'IPv4' }, '::1'))
  })

  it('treats IPv6 wildcards as dual-stack', () => {
    ok(bindingAcceptsHost({ address: '*', family: 'IPv6' }, '127.0.0.1'))
  })

  it('accepts localhost on any loopback or wildcard binding', () => {
    ok(bindingAcceptsHost({ address: '::1', family: 'IPv6' }, 'localhost'))
    ok(
      !bindingAcceptsHost(
        { address: '192.168.1.10', family: 'IPv4' },
        'localhost',
      ),
    )
  })
})

describe('buildGatewayDomainRoutes()', () => {
  it('returns running routes with the default upstream host', () => {
    const state: DenvigState = {
      services: {},
      gatewayRoutes: {
        'api.example.localhost': {
          project: PROJECT_ID,
          service: 'api',
          port: 3000,
          defaultService: true,
          secure: true,
          desiredStatus: 'running',
        },
        'old.example.localhost': {
          project: PROJECT_ID,
          service: 'old',
          port: 3001,
          defaultService: true,
          secure: false,
          desiredStatus: 'stopped',
        },
      },
      certs: {},
    }
    deepStrictEqual(buildGatewayDomainRoutes(state), [
      {
        domain: 'api.example.localhost',
        port: 3000,
        host: '127.0.0.1',
        secure: true,
        projectId: PROJECT_ID,
        serviceName: 'api',
      },
    ])
  })
})

describe('resolvePorts() domains', () => {
  const route = (
    overrides: Partial<GatewayDomainRoute>,
  ): GatewayDomainRoute => ({
    domain: 'api.example.localhost',
    port: 3000,
    host: '127.0.0.1',
    secure: false,
    projectId: PROJECT_ID,
    serviceName: 'api',
    ...overrides,
  })

  it('attaches domains routed to a reachable listener', () => {
    const [port] = resolve(
      [listener({ port: 3000, pid: 100, address: '*', family: 'IPv6' })],
      [candidate({ pids: [10] })],
      [
        route({ domain: 'b.example.localhost', secure: true }),
        route({ domain: 'a.example.localhost' }),
        route({ domain: 'other.example.localhost', port: 4000 }),
      ],
    )
    deepStrictEqual(port.domains, [
      {
        domain: 'a.example.localhost',
        url: 'http://a.example.localhost',
        secure: false,
        host: '127.0.0.1',
        serviceIdentifier: 'github:owner/repo/api',
      },
      {
        domain: 'b.example.localhost',
        url: 'https://b.example.localhost',
        secure: true,
        host: '127.0.0.1',
        serviceIdentifier: 'github:owner/repo/api',
      },
    ])
  })

  it('skips domains whose upstream host the listener does not bind', () => {
    const [port] = resolve(
      [listener({ port: 3000, address: '127.0.0.1' })],
      [],
      [route({ host: '::1' })],
    )
    deepStrictEqual(port.domains, [])
  })

  it('leaves the service unknown when the route owner is not known', () => {
    const [port] = resolve(
      [listener({ port: 3000, address: '127.0.0.1' })],
      [],
      [route({})],
    )
    strictEqual(port.domains[0].serviceIdentifier, null)
  })
})

describe('assertKillable()', () => {
  const info = (listeners: SystemPort[]): PortInfo => ({
    port: 3000,
    inUse: listeners.length > 0,
    listeners,
    services: [],
  })
  const owned = resolve(
    [listener({ port: 3000, pid: 100 })],
    [candidate({ pids: [10] })],
  )
  const orphan = resolve([listener({ port: 3000, pid: 200 })], [])
  const hidden = resolve([listener({ port: 3000, pid: null })], [])

  it('rejects ports nobody listens on', () => {
    throws(() => assertKillable(info([]), false), DenvigValidationError)
  })

  it('rejects ports whose owner is not visible', () => {
    throws(() => assertKillable(info(hidden), true), DenvigOperationError)
  })

  it('protects denvig services unless forced', () => {
    throws(
      () => assertKillable(info(owned), false),
      (error: Error) => {
        ok(error instanceof DenvigValidationError)
        ok(error.message.includes('denvig services stop github:owner/repo/api'))
        return true
      },
    )
    assertKillable(info(owned), true)
  })

  it('allows unrelated processes', () => {
    assertKillable(info(orphan), false)
  })
})
