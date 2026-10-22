import assert from 'node:assert'
import { readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { closeDebugTrace } from '../debug-trace.ts'
import { fetchRegistryJson, logCachedLookup } from './lookup.ts'

describe('deps lookup', () => {
  let server: Server
  let baseUrl: string

  before(async () => {
    server = createServer((req, res) => {
      if (req.url === '/found') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ latest: '1.0.0' }))
      } else {
        res.writeHead(404)
        res.end()
      }
    })
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    baseUrl = `http://127.0.0.1:${address.port}`
  })

  after(() => {
    server.close()
  })

  describe('fetchRegistryJson()', () => {
    it('should return parsed JSON', async () => {
      const data = await fetchRegistryJson(`${baseUrl}/found`)
      assert.deepStrictEqual(data, { latest: '1.0.0' })
    })

    it('should return null for non-2xx responses', async () => {
      assert.strictEqual(await fetchRegistryJson(`${baseUrl}/missing`), null)
    })
  })

  describe('logCachedLookup()', () => {
    const testTracePath = resolve(
      tmpdir(),
      'denvig-test-deps-lookup',
      'run.trace.json',
    )

    after(() => {
      rmSync(testTracePath, { force: true })
      delete process.env.DENVIG_DEBUG
      delete process.env.DENVIG_DEBUG_TRACE_PATH
    })

    it('should trace cache hits on a row per ecosystem', () => {
      process.env.DENVIG_DEBUG = 'deps'
      process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
      logCachedLookup({ ecosystem: 'npm', name: 'zod' })
      closeDebugTrace()

      const events = JSON.parse(readFileSync(testTracePath, 'utf-8'))
      const hit = events.find((e: { ph: string }) => e.ph === 'i')
      assert.strictEqual(hit.name, 'cache hit npm zod')
      assert.deepStrictEqual(hit.args, { ecosystem: 'npm', name: 'zod' })
      const row = events.find(
        (e: { name: string; tid?: number }) =>
          e.name === 'thread_name' && e.tid === hit.tid,
      )
      assert.strictEqual(row.args.name, 'npm cache hits')
    })
  })
})
