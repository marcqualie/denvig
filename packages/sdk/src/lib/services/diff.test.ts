import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { diffLines } from './diff.ts'

describe('diff', () => {
  describe('diffLines()', () => {
    it('returns an empty array for identical input', () => {
      deepStrictEqual(diffLines('a\nb\nc', 'a\nb\nc'), [])
    })

    it('marks a changed line with - and + plus surrounding context', () => {
      deepStrictEqual(diffLines('a\nb\nc', 'a\nB\nc'), [' a', '-b', '+B', ' c'])
    })

    it('shows additions and removals', () => {
      deepStrictEqual(diffLines('a\nb', 'a\nb\nc'), [' a', ' b', '+c'])
      deepStrictEqual(diffLines('a\nb\nc', 'a\nc'), [' a', '-b', ' c'])
    })

    it('collapses long unchanged runs between changes', () => {
      const before = ['x', '1', '2', '3', '4', '5', '6', 'y'].join('\n')
      const after = ['X', '1', '2', '3', '4', '5', '6', 'Y'].join('\n')
      deepStrictEqual(diffLines(before, after, 1), [
        '-x',
        '+X',
        ' 1',
        ' …',
        ' 6',
        '-y',
        '+Y',
      ])
    })
  })
})
