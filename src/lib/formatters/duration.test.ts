import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { parseDuration } from './duration.ts'

describe('parseDuration', () => {
  it('parses seconds', () => {
    assert.equal(parseDuration('30s'), 30_000)
  })

  it('parses minutes', () => {
    assert.equal(parseDuration('5m'), 300_000)
  })

  it('parses hours', () => {
    assert.equal(parseDuration('3h'), 10_800_000)
  })

  it('parses days', () => {
    assert.equal(parseDuration('7d'), 604_800_000)
  })

  it('parses weeks', () => {
    assert.equal(parseDuration('2w'), 1_209_600_000)
  })

  it('parses plain number as minutes (pnpm format)', () => {
    assert.equal(parseDuration('1440'), 86_400_000) // 24 hours
  })

  it('returns null for invalid input', () => {
    assert.equal(parseDuration('abc'), null)
    assert.equal(parseDuration(''), null)
    assert.equal(parseDuration('7x'), null)
    assert.equal(parseDuration('d7'), null)
  })
})
