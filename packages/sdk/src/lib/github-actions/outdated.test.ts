import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseReleases } from './info.ts'
import { resolveOutdatedAction } from './outdated.ts'

const release = (tag_name: string, prerelease = false, draft = false) => ({
  tag_name,
  prerelease,
  draft,
  published_at: `2026-01-01T00:00:00Z`,
})

const info = parseReleases([
  release('v7.1.0-beta.1', true),
  release('v7.0.1'),
  release('v7.0.0'),
  release('v6.1.0'),
  release('v6.0.0'),
  release('v8.0.0', false, true),
  release('latest'),
])

const dependency = (specifier: string) => ({
  id: 'actions:actions/checkout',
  name: 'actions/checkout',
  ecosystem: 'actions',
  versions: [
    {
      resolved: specifier,
      specifier,
      source: '.github/workflows/main.yml#dependencies',
    },
  ],
})

describe('parseReleases()', () => {
  it('returns sorted semver versions and the latest stable release', () => {
    deepStrictEqual(info?.versions, [
      '6.0.0',
      '6.1.0',
      '7.0.0',
      '7.0.1',
      '7.1.0-beta.1',
    ])
    strictEqual(info?.latest, '7.0.1')
  })

  it('returns null when no releases are semver tags', () => {
    strictEqual(parseReleases([release('latest')]), null)
  })
})

describe('resolveOutdatedAction()', () => {
  it('resolves floating major tags to the newest matching release', () => {
    const result = info && resolveOutdatedAction(dependency('6'), info)
    strictEqual(result?.versions[0].resolved, '6.1.0')
    strictEqual(result?.wanted, '6.1.0')
    strictEqual(result?.latest, '7.0.1')
  })

  it('reports pinned versions with a newer release', () => {
    const result = info && resolveOutdatedAction(dependency('7.0.0'), info)
    strictEqual(result?.versions[0].resolved, '7.0.0')
    strictEqual(result?.latest, '7.0.1')
  })

  it('returns null when already on the latest release', () => {
    strictEqual(info && resolveOutdatedAction(dependency('7'), info), null)
    strictEqual(info && resolveOutdatedAction(dependency('7.0.1'), info), null)
  })
})
