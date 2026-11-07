import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:net'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { allocateRandomPort, isPortInUse } from './ports.ts'
import { updateServiceState } from './state.ts'

/**
 * Grab a port the OS reports as free right now, so tests don't depend on a
 * hardcoded port happening to be unused on the machine.
 */
const freePort = async (): Promise<number> => {
  const server = createServer()
  await new Promise<void>((resolve) => server.listen(0, () => resolve()))
  const port = (server.address() as { port: number }).port
  await new Promise<void>((resolve) => server.close(() => resolve()))
  return port
}

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

  for (const host of ['127.0.0.1', '::1']) {
    it(`detects a port bound only on ${host}`, async () => {
      const server = createServer()
      await new Promise<void>((resolve) =>
        server.listen(0, host, () => resolve()),
      )
      const port = (server.address() as { port: number }).port
      try {
        assert.strictEqual(await isPortInUse(port), true)
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()))
      }
    })
  }

  it('does not allocate a port bound only on IPv6 loopback', async () => {
    const server = createServer()
    await new Promise<void>((resolve) =>
      server.listen(0, '::1', () => resolve()),
    )
    const port = (server.address() as { port: number }).port
    try {
      const allocated = await allocateRandomPort({
        preferredPort: port,
        range: { min: port, max: port },
      })
      assert.strictEqual(allocated, null)
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
    const port = await freePort()
    const allocated = await allocateRandomPort({ preferredPort: port })
    assert.strictEqual(allocated, port)
  })

  it('skips ports reserved by other running services', async () => {
    const port = await freePort()
    await updateServiceState('proj1', 'api', {
      cwd: '/tmp/proj1',
      port,
      domains: [],
      desiredStatus: 'running',
    })
    const allocated = await allocateRandomPort({ preferredPort: port })
    assert.notStrictEqual(allocated, port)
    assert.ok(allocated !== null && allocated >= 8000 && allocated <= 9999)
  })

  it('allows reuse of ports reserved by stopped services', async () => {
    const port = await freePort()
    await updateServiceState('proj1', 'api', {
      cwd: '/tmp/proj1',
      port,
      domains: [],
      desiredStatus: 'stopped',
    })
    const allocated = await allocateRandomPort({ preferredPort: port })
    assert.strictEqual(allocated, port)
  })
})
