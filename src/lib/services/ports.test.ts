import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { allocateRandomPort, isPortInUse } from './ports.ts'
import { updateServiceState } from './state.ts'

let originalHome: string | undefined
let tmpHome = ''

describe('port utilities', () => {
  beforeEach(() => {
    originalHome = process.env.HOME
    tmpHome = mkdtempSync(`${tmpdir()}/denvig-ports-`)
    process.env.HOME = tmpHome
  })
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    else delete process.env.HOME
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('detects a port that is currently bound', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, () => resolve()))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const port = (address as { port: number }).port
    try {
      assert.strictEqual(await isPortInUse(port), true)
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })

  it('reports a free port as not in use', async () => {
    const server = createServer()
    await new Promise<void>((resolve) => server.listen(0, () => resolve()))
    const port = (server.address() as { port: number }).port
    await new Promise<void>((resolve) => server.close(() => resolve()))
    assert.strictEqual(await isPortInUse(port), false)
  })

  it('prefers a previously-allocated port when available', async () => {
    const allocated = await allocateRandomPort({ preferredPort: 8765 })
    assert.strictEqual(allocated, 8765)
  })

  it('skips ports reserved by other running services', async () => {
    await updateServiceState('proj1', 'api', {
      cwd: '/tmp/proj1',
      port: 8765,
      domains: [],
      desiredStatus: 'running',
    })
    const allocated = await allocateRandomPort({ preferredPort: 8765 })
    assert.notStrictEqual(allocated, 8765)
    assert.ok(allocated !== null && allocated >= 8000 && allocated <= 9999)
  })

  it('allows reuse of ports reserved by stopped services', async () => {
    await updateServiceState('proj1', 'api', {
      cwd: '/tmp/proj1',
      port: 8766,
      domains: [],
      desiredStatus: 'stopped',
    })
    const allocated = await allocateRandomPort({ preferredPort: 8766 })
    assert.strictEqual(allocated, 8766)
  })
})
