import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  getCert,
  getGatewayRoute,
  getServiceState,
  markGatewayRoutesStoppedForService,
  markServiceStopped,
  readState,
  releaseGatewayRoutesForService,
  removeGatewayRoute,
  removeGatewayRoutesForService,
  removeServiceState,
  reservedPorts,
  setCert,
  setGatewayRoute,
  updateServiceState,
} from './state.ts'

let originalHome: string | undefined
let tmpHome = ''

describe('service state', () => {
  beforeEach(() => {
    originalHome = process.env.HOME
    tmpHome = mkdtempSync(`${tmpdir()}/denvig-state-`)
    process.env.HOME = tmpHome
  })
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    else delete process.env.HOME
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('returns an empty state when the file does not exist', async () => {
    const state = await readState()
    assert.deepStrictEqual(state, {
      services: {},
      gatewayRoutes: {},
      certs: {},
    })
  })

  it('writes and reads a service entry', async () => {
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      port: 8080,
      domains: ['api.test'],
      desiredStatus: 'running',
    })
    const entry = await getServiceState('abc123', 'api')
    assert.deepStrictEqual(entry, {
      cwd: '/tmp/proj',
      port: 8080,
      domains: ['api.test'],
      desiredStatus: 'running',
      serviceName: 'api',
    })
  })

  it('clears the port when explicitly set to undefined', async () => {
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      port: 8080,
      domains: [],
      desiredStatus: 'running',
    })
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      port: undefined,
      domains: [],
      desiredStatus: 'running',
    })
    const entry = await getServiceState('abc123', 'api')
    assert.strictEqual(entry?.port, undefined)
  })

  it('preserves the port when the key is omitted', async () => {
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      port: 8080,
      domains: [],
      desiredStatus: 'running',
    })
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      desiredStatus: 'stopped',
    })
    const entry = await getServiceState('abc123', 'api')
    assert.strictEqual(entry?.port, 8080)
  })

  it('marks a service stopped while preserving the port', async () => {
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      port: 8080,
      domains: [],
      desiredStatus: 'running',
    })
    await markServiceStopped('abc123', 'api')
    const entry = await getServiceState('abc123', 'api')
    assert.strictEqual(entry?.port, 8080)
    assert.strictEqual(entry?.desiredStatus, 'stopped')
  })

  it('removes a service entry on teardown', async () => {
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      port: 8080,
      domains: [],
      desiredStatus: 'running',
    })
    await removeServiceState('abc123', 'api')
    const entry = await getServiceState('abc123', 'api')
    assert.strictEqual(entry, null)
  })

  it('ignores unparseable state files', async () => {
    const fs = await import('node:fs/promises')
    await fs.mkdir(`${tmpHome}/.denvig`, { recursive: true })
    await fs.writeFile(`${tmpHome}/.denvig/state.json`, 'not json', 'utf-8')
    const state = await readState()
    assert.deepStrictEqual(state, {
      services: {},
      gatewayRoutes: {},
      certs: {},
    })
  })

  it('only treats running entries as reserved ports', () => {
    const ports = reservedPorts({
      services: {
        'id:a:api': {
          cwd: '/x',
          port: 8001,
          domains: [],
          desiredStatus: 'running',
        },
        'id:b:web': {
          cwd: '/y',
          port: 8002,
          domains: [],
          desiredStatus: 'stopped',
        },
      },
      gatewayRoutes: {},
      certs: {},
    })
    assert.deepStrictEqual([...ports], [8001])
  })

  it('sets and reads a gateway route', async () => {
    await setGatewayRoute('api.test', {
      project: 'abc',
      service: 'api',
      port: 8000,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    const route = await getGatewayRoute('api.test')
    assert.strictEqual(route?.project, 'abc')
    assert.strictEqual(route?.port, 8000)
    assert.strictEqual(route?.defaultService, true)
  })

  it('marks all routes for a service stopped', async () => {
    await setGatewayRoute('api.test', {
      project: 'abc',
      service: 'api',
      port: 8000,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    await setGatewayRoute('api2.test', {
      project: 'abc',
      service: 'api',
      port: 8000,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    await markGatewayRoutesStoppedForService('abc', 'api')
    const a = await getGatewayRoute('api.test')
    const b = await getGatewayRoute('api2.test')
    assert.strictEqual(a?.desiredStatus, 'stopped')
    assert.strictEqual(b?.desiredStatus, 'stopped')
    assert.strictEqual(a?.port, 8000)
  })

  it('removes all routes for a service', async () => {
    await setGatewayRoute('api.test', {
      project: 'abc',
      service: 'api',
      port: 8000,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    await setGatewayRoute('shared.test', {
      project: 'xyz',
      service: 'other',
      port: 8001,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    await removeGatewayRoutesForService('abc', 'api')
    assert.strictEqual(await getGatewayRoute('api.test'), null)
    const survivor = await getGatewayRoute('shared.test')
    assert.strictEqual(survivor?.service, 'other')
  })

  it('removes a single gateway route', async () => {
    await setGatewayRoute('api.test', {
      project: 'abc',
      service: 'api',
      port: 8000,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    await removeGatewayRoute('api.test')
    assert.strictEqual(await getGatewayRoute('api.test'), null)
  })

  it('hands a released domain back to the running service that declares it', async () => {
    await updateServiceState('orig', 'api', {
      cwd: '/tmp/orig',
      port: 8080,
      domains: ['api.test'],
      desiredStatus: 'running',
      project: {
        id: 'orig',
        slug: 'github:owner/repo',
        name: 'repo',
        path: '/tmp/orig',
      },
      serviceName: 'api',
    })
    await setGatewayRoute('api.test', {
      project: 'wt',
      service: 'api',
      port: 9001,
      secure: true,
      defaultService: false,
      desiredStatus: 'running',
      cert: 'wildcard.test',
    })
    await releaseGatewayRoutesForService('wt', 'api')
    const route = await getGatewayRoute('api.test')
    assert.strictEqual(route?.project, 'orig')
    assert.strictEqual(route?.service, 'api')
    assert.strictEqual(route?.port, 8080)
    assert.strictEqual(route?.desiredStatus, 'running')
    assert.strictEqual(route?.defaultService, true)
    assert.strictEqual(route?.cert, 'wildcard.test')
  })

  it('marks a released domain stopped when the original owner is not running', async () => {
    await updateServiceState('orig', 'api', {
      cwd: '/tmp/orig',
      port: 8080,
      domains: ['api.test'],
      desiredStatus: 'stopped',
      project: {
        id: 'orig',
        slug: 'github:owner/repo',
        name: 'repo',
        path: '/tmp/orig',
      },
      serviceName: 'api',
    })
    await setGatewayRoute('api.test', {
      project: 'wt',
      service: 'api',
      port: 9001,
      secure: false,
      defaultService: false,
      desiredStatus: 'running',
    })
    await releaseGatewayRoutesForService('wt', 'api')
    const route = await getGatewayRoute('api.test')
    assert.strictEqual(route?.project, 'wt')
    assert.strictEqual(route?.desiredStatus, 'stopped')
  })

  it('leaves routes owned by other services alone when releasing', async () => {
    await setGatewayRoute('other.test', {
      project: 'xyz',
      service: 'other',
      port: 8001,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    await releaseGatewayRoutesForService('wt', 'api')
    const route = await getGatewayRoute('other.test')
    assert.strictEqual(route?.desiredStatus, 'running')
  })

  it('sets and reads a cert entry', async () => {
    await setCert('_wildcard.denvig.me', {
      dir: '/certs/_wildcard.denvig.me',
      certPath: '/certs/_wildcard.denvig.me/fullchain.pem',
      keyPath: '/certs/_wildcard.denvig.me/privkey.pem',
      domains: ['*.denvig.me'],
    })
    const cert = await getCert('_wildcard.denvig.me')
    assert.strictEqual(cert?.dir, '/certs/_wildcard.denvig.me')
    assert.deepStrictEqual(cert?.domains, ['*.denvig.me'])
  })

  it('returns an empty state with a certs map', async () => {
    const state = await readState()
    assert.deepStrictEqual(state.certs, {})
  })

  it('persists state through the filesystem', async () => {
    await updateServiceState('abc123', 'api', {
      cwd: '/tmp/proj',
      port: 8080,
      domains: ['api.test'],
      desiredStatus: 'running',
    })
    const content = await readFile(`${tmpHome}/.denvig/state.json`, 'utf-8')
    const parsed = JSON.parse(content)
    assert.deepStrictEqual(parsed.services['id:abc123:api'], {
      cwd: '/tmp/proj',
      port: 8080,
      domains: ['api.test'],
      desiredStatus: 'running',
      serviceName: 'api',
    })
  })
})
