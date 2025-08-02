import { expect } from 'jsr:@std/expect'
import { describe, it } from 'jsr:@std/testing/bdd'
import { stub } from 'jsr:@std/testing/mock'

import { safeReadTextFile } from './safeReadFile.ts'

describe('safeReadFile()', () => {
  it('returns null for a missing file', async () => {
    const result = await safeReadTextFile('/tmp/not/a/file.txt')
    expect(result).toBeNull()
  })

  it('returns the contents of an existing file', async () => {
    const filePath = '/tmp/test-file.txt'
    using _stub = stub(Deno, 'readTextFile', (path) => {
      if (path === filePath) {
        return new Promise((resolve) => resolve('Hello, Denvig!'))
      }
      throw new Deno.errors.NotFound()
    })

    const result = await safeReadTextFile(filePath)
    expect(result).toBe('Hello, Denvig!')
  })
})
