import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { getProjectFlagPartial } from './project-completions.ts'

describe('getProjectFlagPartial()', () => {
  describe('--project=value format', () => {
    it('returns empty string for --project= with no value', () => {
      const result = getProjectFlagPartial(['denvig', 'info', '--project='])
      strictEqual(result, '')
    })

    it('returns partial value for --project=partial', () => {
      const result = getProjectFlagPartial(['denvig', 'info', '--project=marc'])
      strictEqual(result, 'marc')
    })

    it('returns full value for --project=owner/repo', () => {
      const result = getProjectFlagPartial([
        'denvig',
        'info',
        '--project=marcqualie/denvig',
      ])
      strictEqual(result, 'marcqualie/denvig')
    })

    it('returns id: prefix for --project=id:', () => {
      const result = getProjectFlagPartial(['denvig', 'info', '--project=id:'])
      strictEqual(result, 'id:')
    })

    it('returns id: with partial for --project=id:abc', () => {
      const result = getProjectFlagPartial([
        'denvig',
        'info',
        '--project=id:abc',
      ])
      strictEqual(result, 'id:abc')
    })
  })

  describe('--project value format', () => {
    it('returns empty string when --project is last word', () => {
      const result = getProjectFlagPartial(['denvig', 'info', '--project', ''])
      strictEqual(result, '')
    })

    it('returns partial value after --project', () => {
      const result = getProjectFlagPartial([
        'denvig',
        'info',
        '--project',
        'marc',
      ])
      strictEqual(result, 'marc')
    })

    it('returns full value after --project', () => {
      const result = getProjectFlagPartial([
        'denvig',
        'info',
        '--project',
        'marcqualie/denvig',
      ])
      strictEqual(result, 'marcqualie/denvig')
    })
  })

  describe('not completing --project', () => {
    it('returns null for regular command', () => {
      const result = getProjectFlagPartial(['denvig', 'info'])
      strictEqual(result, null)
    })

    it('returns null for other flags', () => {
      const result = getProjectFlagPartial(['denvig', 'info', '--json'])
      strictEqual(result, null)
    })

    it('returns null for command arguments', () => {
      const result = getProjectFlagPartial(['denvig', 'services', 'start'])
      strictEqual(result, null)
    })

    it('returns null for empty words', () => {
      const result = getProjectFlagPartial([])
      strictEqual(result, null)
    })
  })
})

describe('getProjectCompletions()', () => {
  it('returns empty array for / prefix (path completion not yet supported)', async () => {
    const { getProjectCompletions } = await import('./project-completions.ts')
    const result = getProjectCompletions('/usr/')
    deepStrictEqual(result, [])
  })

  it('returns empty array for ~ prefix (path completion not yet supported)', async () => {
    const { getProjectCompletions } = await import('./project-completions.ts')
    const result = getProjectCompletions('~/src')
    deepStrictEqual(result, [])
  })
})
