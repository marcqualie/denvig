import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { activeForegroundRun, isProcessAlive } from './foreground.ts'

/** A PID that is never alive (above the macOS/Linux PID ceiling). */
const DEAD_PID = 99_999_999

describe('isProcessAlive()', () => {
  it('returns true for the current process', () => {
    strictEqual(isProcessAlive(process.pid), true)
  })

  it('returns false for a process that does not exist', () => {
    strictEqual(isProcessAlive(DEAD_PID), false)
  })
})

describe('activeForegroundRun()', () => {
  const entry = (pid: number) => ({
    cwd: '/tmp/proj',
    domains: [],
    desiredStatus: 'running' as const,
    foreground: { pid, startedAt: '2026-09-26T12:00:00.000Z' },
  })

  it('returns the run while its process is alive', () => {
    strictEqual(activeForegroundRun(entry(process.pid))?.pid, process.pid)
  })

  it('returns null once its process has exited', () => {
    strictEqual(activeForegroundRun(entry(DEAD_PID)), null)
  })

  it('returns null when there is no foreground run', () => {
    strictEqual(activeForegroundRun(null), null)
  })
})
