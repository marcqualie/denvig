import assert from 'node:assert'
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, describe, it } from 'node:test'

import {
  appendTraceEvent,
  closeDebugTrace,
  getActiveDebugTracePath,
  getDebugTracePath,
  isDebugEnabled,
} from './debug-trace.ts'

describe('debug-trace', () => {
  const testTracePath = resolve(
    tmpdir(),
    'denvig-test-debug-trace',
    'run.trace.json',
  )

  afterEach(() => {
    closeDebugTrace()
    rmSync(testTracePath, { force: true })
    delete process.env.DENVIG_DEBUG
    delete process.env.DENVIG_DEBUG_TRACE_PATH
  })

  describe('isDebugEnabled()', () => {
    it('should be disabled by default', () => {
      assert.strictEqual(isDebugEnabled('deps'), false)
    })

    it('should match scopes from a comma separated list', () => {
      process.env.DENVIG_DEBUG = 'other, deps'
      assert.strictEqual(isDebugEnabled('deps'), true)
      assert.strictEqual(isDebugEnabled('services'), false)
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
    it('should not write a file when the scope is disabled', () => {
      process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
      appendTraceEvent('deps', { name: 'npm zod', category: 'npm' })
      assert.strictEqual(getActiveDebugTracePath(), null)
      closeDebugTrace()
      assert.strictEqual(existsSync(testTracePath), false)
    })

    it('should write a valid trace once closed', () => {
      process.env.DENVIG_DEBUG = 'deps'
      process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
      appendTraceEvent('deps', {
        name: 'npm zod',
        category: 'npm',
        start: 10,
        end: 25.5,
        args: { status: 200 },
      })
      appendTraceEvent('deps', {
        name: 'npm semver',
        category: 'npm',
        track: 'cache',
      })
      appendTraceEvent('deps', {
        name: 'npm yaml',
        category: 'npm',
        track: 'cache',
      })
      assert.strictEqual(getActiveDebugTracePath(), testTracePath)
      closeDebugTrace()

      const events = JSON.parse(readFileSync(testTracePath, 'utf-8'))
      const slice = events.find((e: { ph: string }) => e.ph === 'X')
      assert.strictEqual(slice.name, 'npm zod')
      assert.strictEqual(slice.cat, 'npm')
      assert.strictEqual(slice.dur, 15500)
      assert.strictEqual(slice.ts, 10000)
      assert.deepStrictEqual(slice.args, { status: 200 })

      const instants = events.filter((e: { ph: string }) => e.ph === 'i')
      assert.strictEqual(instants.length, 2)
      assert.strictEqual(instants[0].tid, instants[1].tid)
      assert.notStrictEqual(instants[0].tid, slice.tid)

      const threadNames = events
        .filter((e: { name: string }) => e.name === 'thread_name')
        .map((e: { args: { name: string } }) => e.args.name)
      assert.deepStrictEqual(threadNames, ['npm zod', 'cache'])

      const processName = events.find(
        (e: { name: string }) => e.name === 'process_name',
      )
      assert.ok(processName.args.name.startsWith('denvig'))
    })
  })
})
