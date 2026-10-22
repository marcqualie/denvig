import assert from 'node:assert'
import { readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { closeDebugTrace } from '../debug-trace.ts'
import { execCommand, runInherit } from './process.ts'

describe('process', () => {
  const testTracePath = resolve(
    tmpdir(),
    'denvig-test-process',
    'run.trace.json',
  )

  /**
   * Close the trace and return the traced command slices.
   */
  const readCommands = () => {
    closeDebugTrace()
    const events = JSON.parse(readFileSync(testTracePath, 'utf-8'))
    return events.filter((e: { ph: string }) => e.ph === 'X') as {
      name: string
      args: Record<string, unknown>
    }[]
  }

  beforeEach(() => {
    process.env.DENVIG_DEBUG = 'deps'
    process.env.DENVIG_DEBUG_TRACE_PATH = testTracePath
  })

  afterEach(() => {
    closeDebugTrace()
    rmSync(testTracePath, { force: true })
    delete process.env.DENVIG_DEBUG
    delete process.env.DENVIG_DEBUG_TRACE_PATH
  })

  it('should trace execCommand calls', async () => {
    const { stdout } = await execCommand('git', ['--version'], { cwd: '/' })
    assert.match(stdout, /^git version/)

    const [command] = readCommands()
    assert.strictEqual(command.name, 'git --version')
    assert.deepStrictEqual(command.args, { cwd: '/', exitCode: 0 })
  })

  it('should trace runInherit calls with their exit code', async () => {
    const ok = await runInherit('git', ['not-a-real-command'], {
      stdio: 'ignore',
    })
    assert.strictEqual(ok, false)

    const [command] = readCommands()
    assert.strictEqual(command.name, 'git not-a-real-command')
    assert.notStrictEqual(command.args.exitCode, 0)
  })
})
