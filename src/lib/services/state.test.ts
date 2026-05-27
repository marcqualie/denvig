import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  getGatewayRoute,
  getServiceState,
  markGatewayRoutesStoppedForService,
  markServiceStopped,
  readState,
  removeGatewayRoutesForService,
  removeServiceState,
  reservedPorts,
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
    assert.deepStrictEqual(state, { services: {}, gatewayRoutes: {} })
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
    })
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
    assert.deepStrictEqual(state, { services: {}, gatewayRoutes: {} })
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
    })
  })
})
