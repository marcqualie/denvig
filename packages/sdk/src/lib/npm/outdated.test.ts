import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it, mock } from 'node:test'

import { extractDepInfo, isLocalDependency, npmOutdated } from './outdated.ts'

describe('extractDepInfo()', () => {
  it('returns the first version entry for plain importer specifiers', () => {
    const info = extractDepInfo({
      versions: [
        { resolved: '1.2.3', specifier: '^1.2.0', source: '.#dependencies' },
      ],
    })
    strictEqual(info?.current, '1.2.3')
    strictEqual(info?.specifier, '^1.2.0')
    strictEqual(info?.isDevDependency, false)
  })

  it('skips literal `catalog:` specifiers in favour of a real range', () => {
    const info = extractDepInfo({
      versions: [
        {
          resolved: '14.0.14',
          specifier: 'catalog:',
          source: 'apps/api#devDependencies',
        },
        {
          resolved: '14.0.14',
          specifier: '^14.0.14',
          source: 'pnpm-workspace.yaml$catalog',
        },
      ],
    })
    strictEqual(info?.current, '14.0.14')
    strictEqual(info?.specifier, '^14.0.14')
    strictEqual(info?.isDevDependency, true)
  })

  it('skips named-catalog specifiers (`catalog:<name>`)', () => {
    const info = extractDepInfo({
      versions: [
        {
          resolved: '18.3.1',
          specifier: 'catalog:legacy',
          source: 'apps/web#dependencies',
        },
        {
          resolved: '18.3.1',
          specifier: '^18.3.1',
          source: 'pnpm-workspace.yaml$catalogs.legacy',
        },
      ],
    })
    strictEqual(info?.specifier, '^18.3.1')
  })

  it('falls back to the first specifier when only catalog entries exist', () => {
    const info = extractDepInfo({
      versions: [
        {
          resolved: '14.0.14',
          specifier: 'catalog:',
          source: 'apps/api#devDependencies',
        },
      ],
    })
    strictEqual(info?.specifier, 'catalog:')
  })
})

describe('isLocalDependency()', () => {
  it('returns true for workspace: specifiers', () => {
    strictEqual(
      isLocalDependency({ current: 'link:../cli', specifier: 'workspace:*' }),
      true,
    )
  })

  it('returns true for link: specifiers', () => {
    strictEqual(
      isLocalDependency({
        current: 'link:../local-pkg',
        specifier: 'link:../local-pkg',
      }),
      true,
    )
  })

  it('returns true when only the resolved version is a link:', () => {
    strictEqual(
      isLocalDependency({ current: 'link:../cli', specifier: '*' }),
      true,
    )
  })

  it('returns false for regular semver dependencies', () => {
    strictEqual(
      isLocalDependency({ current: '1.2.3', specifier: '^1.2.0' }),
      false,
    )
  })
})

describe('npmOutdated()', () => {
  it('excludes link: and workspace: dependencies without querying the registry', async () => {
    const fetchMock = mock.method(globalThis, 'fetch', async () => {
      throw new Error('unexpected registry fetch for a local dependency')
    })

    try {
      const result = await npmOutdated([
        {
          id: 'npm:@denvig-test/workspace-pkg',
          name: '@denvig-test/workspace-pkg',
          ecosystem: 'npm',
          versions: [
            {
              resolved: 'link:../workspace-pkg',
              specifier: 'workspace:*',
              source: 'packages/app#dependencies',
            },
          ],
        },
        {
          id: 'npm:@denvig-test/linked-pkg',
          name: '@denvig-test/linked-pkg',
          ecosystem: 'npm',
          versions: [
            {
              resolved: 'link:../linked-pkg',
              specifier: 'link:../linked-pkg',
              source: '.#dependencies',
            },
          ],
        },
      ])

      deepStrictEqual(result, [])
      strictEqual(fetchMock.mock.callCount(), 0)
    } finally {
      fetchMock.mock.restore()
    }
  })
})
