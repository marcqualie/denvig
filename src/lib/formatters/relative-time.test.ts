import { strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { relativeFormattedTime } from './relative-time.ts'

describe('relativeFormattedTime()', () => {
  const now = new Date('2026-04-20T12:00:00.000Z')

  it('should return seconds for very recent dates', () => {
    strictEqual(relativeFormattedTime('2026-04-20T11:59:30.000Z', now), '30s')
    strictEqual(relativeFormattedTime('2026-04-20T11:59:55.000Z', now), '5s')
  })

  it('should return minutes for dates less than an hour ago', () => {
    strictEqual(relativeFormattedTime('2026-04-20T11:30:00.000Z', now), '30m')
    strictEqual(relativeFormattedTime('2026-04-20T11:55:00.000Z', now), '5m')
  })

  it('should return hours for dates less than a day ago', () => {
    strictEqual(relativeFormattedTime('2026-04-20T11:00:00.000Z', now), '1h')
    strictEqual(relativeFormattedTime('2026-04-20T00:00:00.000Z', now), '12h')
    strictEqual(relativeFormattedTime('2026-04-19T18:00:00.000Z', now), '18h')
  })

  it('should return days for dates less than a week ago', () => {
    strictEqual(relativeFormattedTime('2026-04-19T12:00:00.000Z', now), '1d')
    strictEqual(relativeFormattedTime('2026-04-17T12:00:00.000Z', now), '3d')
    strictEqual(relativeFormattedTime('2026-04-14T12:00:00.000Z', now), '6d')
  })

  it('should return weeks for dates less than a month ago', () => {
    strictEqual(relativeFormattedTime('2026-04-13T12:00:00.000Z', now), '1w')
    strictEqual(relativeFormattedTime('2026-04-06T12:00:00.000Z', now), '2w')
    strictEqual(relativeFormattedTime('2026-03-23T12:00:00.000Z', now), '4w')
  })

  it('should return months for dates less than a year ago', () => {
    strictEqual(relativeFormattedTime('2026-03-20T12:00:00.000Z', now), '1mo')
    strictEqual(relativeFormattedTime('2026-01-20T12:00:00.000Z', now), '3mo')
    strictEqual(relativeFormattedTime('2025-10-20T12:00:00.000Z', now), '6mo')
  })

  it('should return years for dates more than a year ago', () => {
    strictEqual(relativeFormattedTime('2025-04-01T12:00:00.000Z', now), '1y')
    strictEqual(relativeFormattedTime('2024-04-01T12:00:00.000Z', now), '2y')
    strictEqual(relativeFormattedTime('2021-04-01T12:00:00.000Z', now), '5y')
  })

  it('should round to the nearest whole number', () => {
    // 10 days = 1.43 weeks, rounds to 1w
    strictEqual(relativeFormattedTime('2026-04-10T12:00:00.000Z', now), '1w')
    // 20 days = 2.86 weeks, rounds to 3w
    strictEqual(relativeFormattedTime('2026-03-31T12:00:00.000Z', now), '3w')
  })

  it('should return 0s for future dates', () => {
    strictEqual(relativeFormattedTime('2026-04-21T12:00:00.000Z', now), '0s')
  })
})
