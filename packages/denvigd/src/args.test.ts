import { strictEqual, throws } from 'node:assert'
import { describe, it } from 'node:test'

import { DEFAULT_SOCKET_PATH, parseDaemonArgs } from './args.ts'

describe('parseDaemonArgs()', () => {
  it('should default to the home socket', () => {
    const args = parseDaemonArgs([])
    strictEqual(args.socketPath, DEFAULT_SOCKET_PATH)
  })

  it('should accept --socket', () => {
    const args = parseDaemonArgs(['--socket', '/tmp/test.sock'])
    strictEqual(args.socketPath, '/tmp/test.sock')
  })

  it('should reject unknown flags', () => {
    throws(() => parseDaemonArgs(['--nope']))
  })
})
