import assert from 'node:assert'
import { readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'

import { closeDebugTrace } from '../debug-trace.ts'
import {
  fetchRegistryJson,
  logCachedLookup,
  timeNetworkLookup,
} from './lookup.ts'

type TraceEvent = {
  ph: string
  name: string
  dur?: number
  args: Record<string, unknown>
}

describe('deps lookup', () => {
  const testTracePath = resolve(
    tmpdir(),
    'denvig-test-deps-lookup',
    'run.trace.json',
  )
  let server: Server
  let baseUrl: string

  /**
   * Close the trace and return its lookup events.
   */
  const readLookups = (): TraceEvent[] => {
    closeDebugTrace()
    const events: TraceEvent[] = JSON.parse(
      readFileSync(testTracePath, 'utf-8'),
    )
    return events.filter((e) => e.ph === 'X' || e.ph === 'i')
  }

  before(async () => {
    process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
    process.env.DENVIG_DEBUG = 'deps'
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
    delete process.env.DENVIG_DEBUG
    delete process.env.DENVIG_DEBUG_TRACE_PATH
  })

  afterEach(() => {
    closeDebugTrace()
    rmSync(testTracePath, { force: true })
  })

  it('should trace cache hits as instant events', () => {
    logCachedLookup({ ecosystem: 'npm', name: 'zod' })
    const [event] = readLookups()
    assert.strictEqual(event.ph, 'i')
    assert.strictEqual(event.name, 'npm zod')
    assert.strictEqual(event.args.source, 'cache')
  })

  it('should return JSON and trace status and duration', async () => {
    const url = `${baseUrl}/found`
    const data = await fetchRegistryJson<{ latest: string }>({
      ecosystem: 'npm',
      name: 'zod',
      url,
    })
    assert.deepStrictEqual(data, { latest: '1.0.0' })

    const [event] = readLookups()
    assert.strictEqual(event.ph, 'X')
    assert.strictEqual(event.args.source, 'network')
    assert.strictEqual(event.args.url, url)
    assert.strictEqual(event.args.status, 200)
    assert.strictEqual(typeof event.dur, 'number')
  })

  it('should return null and trace the status for non-2xx responses', async () => {
    const data = await fetchRegistryJson({
      ecosystem: 'npm',
      name: 'missing',
      url: `${baseUrl}/missing`,
    })
    assert.strictEqual(data, null)

    const [event] = readLookups()
    assert.strictEqual(event.args.status, 404)
  })

  it('should trace and rethrow errors', async () => {
    await assert.rejects(
      timeNetworkLookup(
        { ecosystem: 'actions', name: 'a/b', url: 'https://example.com' },
        async () => {
          throw new Error('boom')
        },
      ),
      /boom/,
    )

    const [event] = readLookups()
    assert.strictEqual(event.args.error, 'boom')
  })
})
