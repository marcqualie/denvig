import { deepStrictEqual } from 'node:assert'
import { it } from 'node:test'

import { optimiseVersions } from './optimise.ts'

it('combines compatible versions', () => {
  const dependencies = {
    '18.1.2': ['^18.1.0', '^18.1.2'],
    '18.2.0': ['^18.2.0'],
    '19.0.1': ['19.0.1', '^19.0.0'],
  }

  const result = optimiseVersions(dependencies)

  deepStrictEqual(result, {
    '18.2.0': ['^18.1.0', '^18.1.2', '^18.2.0'],
    '19.0.1': ['19.0.1', '^19.0.0'],
  })
})
