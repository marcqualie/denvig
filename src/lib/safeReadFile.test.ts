import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { safeReadTextFile } from './safeReadFile.ts'

describe('safeReadFile()', () => {
  it('returns null for a missing file', async () => {
    const result = await safeReadTextFile('/tmp/not/a/file.txt')
    strictEqual(result, null)
  })

  // TODO: Re-enable mocking tests when Node.js compatible mocking is implemented
  // it('returns the contents of an existing file', async () => {
  //   // Test disabled - needs Node.js compatible mocking
  // })
})
