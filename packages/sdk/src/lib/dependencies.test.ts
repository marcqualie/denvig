import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { dedupeDependencies } from './dependencies.ts'

import type { ProjectDependencySchema } from './dependencies.ts'

describe('dedupeDependencies()', () => {
  it('should return empty array for empty input', () => {
    const result = dedupeDependencies([])
    deepStrictEqual(result, [])
  })

  it('should return single dependency unchanged', () => {
    const deps: ProjectDependencySchema[] = [
      {
        id: 'npm:react',
        name: 'react',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '18.2.0',
            specifier: '^18.0.0',
            source: '.#dependencies',
          },
        ],
      },
    ]
    const result = dedupeDependencies(deps)
    strictEqual(result.length, 1)
    deepStrictEqual(result[0], deps[0])
  })

  it('should merge versions arrays for duplicate dependencies', () => {
    const deps: ProjectDependencySchema[] = [
      {
        id: 'npm:react',
        name: 'react',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '18.2.0',
            specifier: '^18.0.0',
            source: 'packages/app#dependencies',
          },
        ],
      },
      {
        id: 'npm:react',
        name: 'react',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '18.2.0',
            specifier: '^18.2.0',
            source: 'packages/web#dependencies',
          },
        ],
      },
    ]
    const result = dedupeDependencies(deps)
    strictEqual(result.length, 1)
    strictEqual(result[0].id, 'npm:react')
    strictEqual(result[0].versions.length, 2)
    deepStrictEqual(result[0].versions, [
      {
        resolved: '18.2.0',
        specifier: '^18.0.0',
        source: 'packages/app#dependencies',
      },
      {
        resolved: '18.2.0',
        specifier: '^18.2.0',
        source: 'packages/web#dependencies',
      },
    ])
  })

  it('should keep different dependencies separate', () => {
    const deps: ProjectDependencySchema[] = [
      {
        id: 'npm:react',
        name: 'react',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '18.2.0',
            specifier: '^18.0.0',
            source: '.#dependencies',
          },
        ],
      },
      {
        id: 'npm:typescript',
        name: 'typescript',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '5.0.0',
            specifier: '^5.0.0',
            source: '.#devDependencies',
          },
        ],
      },
    ]
    const result = dedupeDependencies(deps)
    strictEqual(result.length, 2)
  })

  it('should merge multiple occurrences of the same dependency', () => {
    const deps: ProjectDependencySchema[] = [
      {
        id: 'npm:lodash',
        name: 'lodash',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '4.17.21',
            specifier: '^4.17.0',
            source: 'pkg1#dependencies',
          },
        ],
      },
      {
        id: 'npm:lodash',
        name: 'lodash',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '4.17.21',
            specifier: '^4.17.20',
            source: 'pkg2#dependencies',
          },
        ],
      },
      {
        id: 'npm:lodash',
        name: 'lodash',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '4.17.21',
            specifier: '~4.17.21',
            source: 'pkg3#dependencies',
          },
        ],
      },
    ]
    const result = dedupeDependencies(deps)
    strictEqual(result.length, 1)
    strictEqual(result[0].versions.length, 3)
  })

  it('should handle dependencies from different ecosystems with same name', () => {
    const deps: ProjectDependencySchema[] = [
      {
        id: 'npm:yaml',
        name: 'yaml',
        ecosystem: 'npm',
        versions: [
          { resolved: '2.0.0', specifier: '^2.0.0', source: '.#dependencies' },
        ],
      },
      {
        id: 'pypi:yaml',
        name: 'yaml',
        ecosystem: 'pypi',
        versions: [
          { resolved: '6.0.0', specifier: '>=6.0', source: '.#dependencies' },
        ],
      },
    ]
    const result = dedupeDependencies(deps)
    strictEqual(result.length, 2)
  })
})
