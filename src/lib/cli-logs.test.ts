import assert from 'node:assert'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, before, beforeEach, describe, it } from 'node:test'

import {
  appendCliLog,
  createCliLogTracker,
  getCliLogsPath,
  isCliLoggingEnabled,
} from './cli-logs.ts'

describe('cli-logs', () => {
  // Use a unique test directory to avoid interfering with real logs
  const testDir = resolve(tmpdir(), 'denvig-test-cli-logs')
  const testLogPath = resolve(testDir, 'cli.jsonl')

  before(() => {
    // Set the test log path before any tests run
    process.env.DENVIG_CLI_LOGS_PATH = testLogPath
  })

  beforeEach(async () => {
    // Clean up any existing log file before each test
    await rm(testLogPath, { force: true })
  })

  afterEach(async () => {
    // Clean up after tests
    await rm(testLogPath, { force: true })
    // Reset env vars (but keep DENVIG_CLI_LOGS_PATH for subsequent tests)
    delete process.env.DENVIG_CLI_LOGS_ENABLED
  })

  describe('isCliLoggingEnabled()', () => {
    it('should return true by default', () => {
      delete process.env.DENVIG_CLI_LOGS_ENABLED
      assert.strictEqual(isCliLoggingEnabled(), true)
    })

    it('should return false when DENVIG_CLI_LOGS_ENABLED=0', () => {
      process.env.DENVIG_CLI_LOGS_ENABLED = '0'
      assert.strictEqual(isCliLoggingEnabled(), false)
    })

    it('should return true for any other value', () => {
      process.env.DENVIG_CLI_LOGS_ENABLED = '1'
      assert.strictEqual(isCliLoggingEnabled(), true)

      process.env.DENVIG_CLI_LOGS_ENABLED = 'true'
      assert.strictEqual(isCliLoggingEnabled(), true)

      process.env.DENVIG_CLI_LOGS_ENABLED = 'false'
      assert.strictEqual(isCliLoggingEnabled(), true)
    })
  })

  describe('getCliLogsPath()', () => {
    it('should return the overridden path when DENVIG_CLI_LOGS_PATH is set', () => {
      assert.strictEqual(getCliLogsPath(), testLogPath)
    })
  })

  describe('appendCliLog()', () => {
    it('should append a log entry to the file', async () => {
      const entry = {
        timestamp: '2026-01-24T12:00:00.000Z',
        version: '1.0.0',
        command: 'denvig version',
        path: '/test/path',
        duration: 100,
        status: 0,
      }

      await appendCliLog(entry)

      const content = await readFile(testLogPath, 'utf-8')
      const lines = content.trim().split('\n')
      assert.strictEqual(lines.length, 1)
      assert.deepStrictEqual(JSON.parse(lines[0]), entry)
    })

    it('should append log entry with via field', async () => {
      const entry = {
        timestamp: '2026-01-24T12:00:00.000Z',
        version: '1.0.0',
        command: 'denvig services list',
        path: '/test/path',
        duration: 200,
        status: 0,
        via: 'my-sdk-consumer',
      }

      await appendCliLog(entry)

      const content = await readFile(testLogPath, 'utf-8')
      const parsed = JSON.parse(content.trim())
      assert.strictEqual(parsed.via, 'my-sdk-consumer')
    })

    it('should append multiple entries', async () => {
      const entry1 = {
        timestamp: '2026-01-24T12:00:00.000Z',
        version: '1.0.0',
        command: 'denvig version',
        path: '/test/path',
        duration: 100,
        status: 0,
      }
      const entry2 = {
        timestamp: '2026-01-24T12:00:01.000Z',
        version: '1.0.0',
        command: 'denvig services list',
        path: '/test/path',
        duration: 200,
        status: 1,
      }

      await appendCliLog(entry1)
      await appendCliLog(entry2)

      const content = await readFile(testLogPath, 'utf-8')
      const lines = content.trim().split('\n')
      assert.strictEqual(lines.length, 2)
      assert.deepStrictEqual(JSON.parse(lines[0]), entry1)
      assert.deepStrictEqual(JSON.parse(lines[1]), entry2)
    })

    it('should not log when disabled', async () => {
      process.env.DENVIG_CLI_LOGS_ENABLED = '0'

      const entry = {
        timestamp: '2026-01-24T12:00:00.000Z',
        version: '1.0.0',
        command: 'denvig version',
        path: '/test/path',
        duration: 100,
        status: 0,
      }

      await appendCliLog(entry)

      // File should not exist
      try {
        await readFile(testLogPath, 'utf-8')
        assert.fail('File should not exist')
      } catch (error) {
        const nodeError = error as NodeJS.ErrnoException
        assert.strictEqual(nodeError.code, 'ENOENT')
      }
    })
  })

  describe('createCliLogTracker()', () => {
    it('should track command execution and log on finish', async () => {
      const tracker = createCliLogTracker({
        version: '1.0.0',
        command: 'denvig test-command',
        path: '/test/path',
      })

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10))

      await tracker.finish(0)

      const content = await readFile(testLogPath, 'utf-8')
      const entry = JSON.parse(content.trim())

      assert.strictEqual(entry.version, '1.0.0')
      assert.strictEqual(entry.command, 'denvig test-command')
      assert.strictEqual(entry.path, '/test/path')
      assert.strictEqual(entry.status, 0)
      assert.ok(entry.duration >= 10, 'Duration should be at least 10ms')
      assert.ok(entry.timestamp, 'Should have a timestamp')
      assert.strictEqual(entry.via, undefined, 'Should not have via field')
    })

    it('should include via field when provided', async () => {
      const tracker = createCliLogTracker({
        version: '1.0.0',
        command: 'denvig test-command',
        path: '/test/path',
        via: 'custom-integration',
      })

      await tracker.finish(0)

      const content = await readFile(testLogPath, 'utf-8')
      const entry = JSON.parse(content.trim())

      assert.strictEqual(entry.via, 'custom-integration')
    })

    it('should include slug when provided', async () => {
      const tracker = createCliLogTracker({
        version: '1.0.0',
        command: 'denvig test-command',
        path: '/test/path',
        slug: 'owner/repo',
      })

      await tracker.finish(0)

      const content = await readFile(testLogPath, 'utf-8')
      const entry = JSON.parse(content.trim())

      assert.strictEqual(entry.slug, 'owner/repo')
    })

    it('should log error status correctly', async () => {
      const tracker = createCliLogTracker({
        version: '1.0.0',
        command: 'denvig failing-command',
        path: '/test/path',
      })

      await tracker.finish(1)

      const content = await readFile(testLogPath, 'utf-8')
      const entry = JSON.parse(content.trim())

      assert.strictEqual(entry.status, 1)
      assert.strictEqual(
        entry.error,
        undefined,
        'Should not have error field without message',
      )
    })

    it('should include error message when provided', async () => {
      const tracker = createCliLogTracker({
        version: '1.0.0',
        command: 'denvig bad-command',
        path: '/test/path',
      })

      await tracker.finish(1, 'Command "bad-command" not found')

      const content = await readFile(testLogPath, 'utf-8')
      const entry = JSON.parse(content.trim())

      assert.strictEqual(entry.status, 1)
      assert.strictEqual(entry.error, 'Command "bad-command" not found')
    })
  })
})
