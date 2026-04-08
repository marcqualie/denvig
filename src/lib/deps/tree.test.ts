import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { buildReverseChain, parseParentFromSource } from './tree.ts'

import type { ProjectDependencySchema } from '../dependencies.ts'

describe('parseParentFromSource()', () => {
  it('should return null for non-lockfile sources', () => {
    strictEqual(parseParentFromSource('.#dependencies'), null)
    strictEqual(parseParentFromSource('.#devDependencies'), null)
    strictEqual(parseParentFromSource('packages/app#dependencies'), null)
  })

  it('should parse unscoped pnpm lockfile sources', () => {
    deepStrictEqual(parseParentFromSource('pnpm-lock.yaml:tsup@8.5.0'), {
      name: 'tsup',
      version: '8.5.0',
    })
  })

  it('should parse scoped pnpm lockfile sources', () => {
    deepStrictEqual(
      parseParentFromSource(
        'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3',
      ),
      { name: '@serverless/dashboard-plugin', version: '7.2.3' },
    )
  })

  it('should parse sources with peer dependency qualifiers', () => {
    deepStrictEqual(
      parseParentFromSource('pnpm-lock.yaml:tsup@8.5.0(typescript@5.9.3)'),
      { name: 'tsup', version: '8.5.0' },
    )
    deepStrictEqual(
      parseParentFromSource(
        'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3(serverless@3.38.0)',
      ),
      { name: '@serverless/dashboard-plugin', version: '7.2.3' },
    )
  })

  it('should parse yarn lockfile sources', () => {
    deepStrictEqual(parseParentFromSource('yarn.lock:webpack@5.90.0'), {
      name: 'webpack',
      version: '5.90.0',
    })
    deepStrictEqual(parseParentFromSource('yarn.lock:@babel/core@7.24.0'), {
      name: '@babel/core',
      version: '7.24.0',
    })
  })

  it('should parse other lockfile sources', () => {
    deepStrictEqual(parseParentFromSource('Gemfile.lock:rails@7.1.0'), {
      name: 'rails',
      version: '7.1.0',
    })
    deepStrictEqual(parseParentFromSource('uv.lock:requests@2.31.0'), {
      name: 'requests',
      version: '2.31.0',
    })
  })
})

describe('buildReverseChain()', () => {
  const makeDep = (
    name: string,
    versions: { resolved: string; source: string }[],
  ): ProjectDependencySchema => ({
    id: `npm:${name}`,
    name,
    ecosystem: 'npm',
    versions: versions.map((v) => ({ ...v, specifier: v.resolved })),
  })

  it('should return single node for direct dependencies', () => {
    const depsMap = new Map<string, ProjectDependencySchema>()
    depsMap.set(
      'react',
      makeDep('react', [{ resolved: '19.0.0', source: '.#dependencies' }]),
    )

    const result = buildReverseChain(
      'react',
      '19.0.0',
      '.#dependencies',
      depsMap,
    )
    deepStrictEqual(result, {
      name: 'react',
      version: '19.0.0',
      children: [],
    })
  })

  it('should build chain through unscoped transitive dependencies', () => {
    const depsMap = new Map<string, ProjectDependencySchema>()
    depsMap.set(
      'serverless',
      makeDep('serverless', [{ resolved: '3.38.0', source: '.#dependencies' }]),
    )
    depsMap.set(
      'simple-git',
      makeDep('simple-git', [
        { resolved: '3.30.0', source: 'pnpm-lock.yaml:serverless@3.38.0' },
      ]),
    )

    const result = buildReverseChain(
      'simple-git',
      '3.30.0',
      'pnpm-lock.yaml:serverless@3.38.0',
      depsMap,
    )
    deepStrictEqual(result, {
      name: 'serverless',
      version: '3.38.0',
      children: [
        {
          name: 'simple-git',
          version: '3.30.0',
          children: [],
        },
      ],
    })
  })

  it('should build chain through scoped transitive dependencies', () => {
    const depsMap = new Map<string, ProjectDependencySchema>()
    depsMap.set(
      'serverless',
      makeDep('serverless', [{ resolved: '3.38.0', source: '.#dependencies' }]),
    )
    depsMap.set(
      '@serverless/dashboard-plugin',
      makeDep('@serverless/dashboard-plugin', [
        { resolved: '7.2.3', source: 'pnpm-lock.yaml:serverless@3.38.0' },
      ]),
    )
    depsMap.set(
      'simple-git',
      makeDep('simple-git', [
        {
          resolved: '3.30.0',
          source: 'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3',
        },
      ]),
    )

    const result = buildReverseChain(
      'simple-git',
      '3.30.0',
      'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3',
      depsMap,
    )
    deepStrictEqual(result, {
      name: 'serverless',
      version: '3.38.0',
      children: [
        {
          name: '@serverless/dashboard-plugin',
          version: '7.2.3',
          children: [
            {
              name: 'simple-git',
              version: '3.30.0',
              children: [],
            },
          ],
        },
      ],
    })
  })

  it('should build chain through scoped dependencies with peer qualifiers', () => {
    const depsMap = new Map<string, ProjectDependencySchema>()
    depsMap.set(
      'serverless',
      makeDep('serverless', [{ resolved: '3.38.0', source: '.#dependencies' }]),
    )
    depsMap.set(
      '@serverless/dashboard-plugin',
      makeDep('@serverless/dashboard-plugin', [
        { resolved: '7.2.3', source: 'pnpm-lock.yaml:serverless@3.38.0' },
      ]),
    )
    depsMap.set(
      'axios',
      makeDep('axios', [
        {
          resolved: '1.13.2',
          source:
            'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3(serverless@3.38.0)',
        },
      ]),
    )

    const result = buildReverseChain(
      'axios',
      '1.13.2',
      'pnpm-lock.yaml:@serverless/dashboard-plugin@7.2.3(serverless@3.38.0)',
      depsMap,
    )
    deepStrictEqual(result, {
      name: 'serverless',
      version: '3.38.0',
      children: [
        {
          name: '@serverless/dashboard-plugin',
          version: '7.2.3',
          children: [
            {
              name: 'axios',
              version: '1.13.2',
              children: [],
            },
          ],
        },
      ],
    })
  })

  it('should return null when chain is empty', () => {
    const depsMap = new Map<string, ProjectDependencySchema>()
    const result = buildReverseChain(
      'unknown',
      '1.0.0',
      'pnpm-lock.yaml:missing@1.0.0',
      depsMap,
    )
    deepStrictEqual(result, {
      name: 'missing',
      version: '1.0.0',
      children: [
        {
          name: 'unknown',
          version: '1.0.0',
          children: [],
        },
      ],
    })
  })
})
