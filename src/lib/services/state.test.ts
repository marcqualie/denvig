import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import {
  getServiceState,
  markServiceStopped,
  readState,
  removeServiceState,
  reservedPorts,
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
    assert.deepStrictEqual(state, { services: {} })
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
    assert.deepStrictEqual(state, { services: {} })
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
    })
    assert.deepStrictEqual([...ports], [8001])
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
