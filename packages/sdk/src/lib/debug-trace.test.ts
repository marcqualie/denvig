import assert from 'node:assert'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { after, afterEach, before, describe, it } from 'node:test'

import {
  appendTraceEvent,
  closeDebugTrace,
  enableFetchTracing,
  getActiveDebugTracePath,
  getDebugTracePath,
  isDebugEnabled,
  isTracingEnabled,
  traceCommand,
} from './debug-trace.ts'

type TraceEvent = {
  ph: string
  name: string
  pid: number
  tid?: number
  ts?: number
  dur?: number
  cat?: string
  args: Record<string, unknown>
}

describe('debug-trace', () => {
  const testTracePath = resolve(
    tmpdir(),
    'denvig-test-debug-trace',
    'run.trace.json',
  )

  /**
   * Close the trace and parse its events.
   */
  const readTrace = (): TraceEvent[] => {
    closeDebugTrace()
    return JSON.parse(readFileSync(testTracePath, 'utf-8'))
  }

  const enableTracing = (scopes = 'deps') => {
    process.env.DENVIG_DEBUG = scopes
    process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
  }

  afterEach(() => {
    closeDebugTrace()
    rmSync(testTracePath, { force: true })
    delete process.env.DENVIG_DEBUG
    delete process.env.DENVIG_DEBUG_TRACE_PATH
  })

  describe('isDebugEnabled()', () => {
    it('should be disabled by default', () => {
      assert.strictEqual(isDebugEnabled('deps'), false)
      assert.strictEqual(isTracingEnabled(), false)
    })

    it('should match scopes from a comma separated list', () => {
      process.env.DENVIG_DEBUG = 'other, deps'
      assert.strictEqual(isDebugEnabled('deps'), true)
      assert.strictEqual(isDebugEnabled('services'), false)
      assert.strictEqual(isTracingEnabled(), true)
    })

    it('should enable every scope with *', () => {
      process.env.DENVIG_DEBUG = '*'
      assert.strictEqual(isDebugEnabled('deps'), true)
    })

    it('should not match partial scope names', () => {
      process.env.DENVIG_DEBUG = 'deps-extra'
      assert.strictEqual(isDebugEnabled('deps'), false)
    })
  })

  describe('getDebugTracePath()', () => {
    it('should default to a dated file per run', () => {
      const path = getDebugTracePath()
      const date = new Date().toISOString().slice(0, 10)
      assert.ok(
        path.startsWith(resolve(homedir(), '.denvig/logs/debug/traces', date)),
      )
      assert.ok(path.endsWith(`-${process.pid}.trace.json`))
    })

    it('should use DENVIG_DEBUG_TRACE_PATH when set', () => {
      process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
      assert.strictEqual(getDebugTracePath(), testTracePath)
    })
  })

  describe('appendTraceEvent()', () => {
    it('should not write a file when tracing is disabled', () => {
      process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
      appendTraceEvent({ group: 'denvig', name: 'command', category: 'cli' })
      assert.strictEqual(getActiveDebugTracePath(), null)
      closeDebugTrace()
      assert.strictEqual(existsSync(testTracePath), false)
    })

    it('should skip scoped events when their scope is disabled', () => {
      enableTracing('other')
      appendTraceEvent({
        group: 'denvig',
        scope: 'deps',
        name: 'plugin npm',
        category: 'plugin',
      })
      assert.strictEqual(getActiveDebugTracePath(), null)
    })

    it('should write a valid trace once closed', () => {
      enableTracing()
      appendTraceEvent({
        group: 'denvig',
        scope: 'deps',
        name: 'plugin npm',
        category: 'plugin',
        start: 10,
        end: 25.5,
        args: { outdated: 2 },
      })
      appendTraceEvent({
        group: 'denvig',
        name: 'cache hit npm semver',
        category: 'npm',
        track: 'npm cache hits',
      })
      appendTraceEvent({
        group: 'denvig',
        name: 'cache hit npm yaml',
        category: 'npm',
        track: 'npm cache hits',
      })
      assert.strictEqual(getActiveDebugTracePath(), testTracePath)

      const events = readTrace()
      const slice = events.find((e) => e.ph === 'X')
      assert.ok(slice)
      assert.strictEqual(slice.name, 'plugin npm')
      assert.strictEqual(slice.dur, 15500)
      assert.strictEqual(slice.ts, 10000)
      assert.deepStrictEqual(slice.args, { outdated: 2 })

      const instants = events.filter((e) => e.ph === 'i')
      assert.strictEqual(instants.length, 2)
      assert.strictEqual(instants[0].tid, instants[1].tid)
      assert.notStrictEqual(instants[0].tid, slice.tid)

      const threadNames = events
        .filter((e) => e.name === 'thread_name')
        .map((e) => e.args.name)
      assert.deepStrictEqual(threadNames, ['plugin npm', 'npm cache hits'])
    })

    it('should put each group in its own named process', () => {
      enableTracing()
      appendTraceEvent({ group: 'denvig', name: 'a', category: 'cli' })
      appendTraceEvent({ group: 'fetch', name: 'b', category: 'fetch' })
      appendTraceEvent({ group: 'commands', name: 'c', category: 'git' })

      const events = readTrace()
      const names = events
        .filter((e) => e.name === 'process_name')
        .map((e) => [e.pid, e.args.name])
      assert.strictEqual(names.length, 3)
      assert.ok(String(names[0][1]).startsWith('denvig'))
      assert.deepStrictEqual(names.slice(1), [
        [2, 'fetch requests'],
        [3, 'commands'],
      ])
      const pids = new Set(events.filter((e) => e.ph === 'i').map((e) => e.pid))
      assert.strictEqual(pids.size, 3)
    })

    it('should stay loadable when the process dies before closing', () => {
      enableTracing()
      appendTraceEvent({ group: 'denvig', name: 'a', category: 'cli' })
      const content = readFileSync(testTracePath, 'utf-8')
      assert.ok(!content.trimEnd().endsWith(','))
      assert.ok(Array.isArray(JSON.parse(`${content}]`)))
    })
  })

  describe('traceCommand()', () => {
    it('should trace commands by their command line', async () => {
      enableTracing()
      const result = await traceCommand(
        'git',
        ['--version'],
        '/tmp',
        async () => 'ok',
      )
      assert.strictEqual(result, 'ok')

      const slice = readTrace().find((e) => e.ph === 'X')
      assert.ok(slice)
      assert.strictEqual(slice.pid, 3)
      assert.strictEqual(slice.name, 'git --version')
      assert.strictEqual(slice.cat, 'git')
      assert.deepStrictEqual(slice.args, { cwd: '/tmp', exitCode: 0 })
    })

    it('should trace and rethrow failures', async () => {
      enableTracing()
      const failure = Object.assign(new Error('timed out\n'), {
        signal: 'SIGTERM',
      })
      await assert.rejects(
        traceCommand('git', ['ls-remote'], undefined, async () => {
          throw failure
        }),
        /timed out/,
      )

      const slice = readTrace().find((e) => e.ph === 'X')
      assert.ok(slice)
      assert.strictEqual(slice.args.signal, 'SIGTERM')
      assert.strictEqual(slice.args.error, 'timed out')
    })
  })

  describe('enableFetchTracing()', () => {
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

    it('should trace every fetch request with a fetch prefix', async () => {
      enableTracing()
      enableFetchTracing()

      const found = await fetch(`${baseUrl}/found`)
      await found.json()
      await fetch(`${baseUrl}/%40types%2Fnode`)

      const requests = readTrace().filter((e) => e.ph === 'X')
      assert.strictEqual(requests.length, 2)
      const host = baseUrl.replace('http://', '')
      assert.deepStrictEqual(
        requests.map((e) => [e.pid, e.name, e.args.status]),
        [
          [2, `fetch GET ${host}/found`, 200],
          [2, `fetch GET ${host}/@types/node`, 404],
        ],
      )
      assert.strictEqual(requests[0].args.url, `${baseUrl}/found`)
      assert.strictEqual(typeof requests[0].args.timeToHeadersMs, 'number')
    })
  })
})
