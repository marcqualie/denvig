import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseReleases, parseTagCommits } from './info.ts'
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

const SHA_7_0_0 = 'a'.repeat(40)
const SHA_7_0_1 = 'b'.repeat(40)
const SHA_UNTAGGED = 'c'.repeat(40)

describe('parseTagCommits()', () => {
  it('maps commits to the most specific semver tag using peeled refs', () => {
    const tagCommits = parseTagCommits(
      [
        `${SHA_7_0_0}\trefs/tags/v7.0.0`,
        `${'d'.repeat(40)}\trefs/tags/v7`,
        `${SHA_7_0_1}\trefs/tags/v7^{}`,
        `${SHA_7_0_1}\trefs/tags/v7.0.1`,
        `${SHA_7_0_1}\trefs/tags/latest`,
      ].join('\n'),
    )
    deepStrictEqual(tagCommits, {
      [SHA_7_0_0]: '7.0.0',
      [SHA_7_0_1]: '7.0.1',
    })
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

  it('resolves commit SHA pins to the tag pointing at that commit', () => {
    const tagCommits = { [SHA_7_0_0]: '7.0.0', [SHA_7_0_1]: '7.0.1' }
    const result =
      info && resolveOutdatedAction(dependency(SHA_7_0_0), info, tagCommits)
    strictEqual(result?.versions[0].resolved, '7.0.0')
    strictEqual(result?.specifier, SHA_7_0_0)
    strictEqual(result?.latest, '7.0.1')
    strictEqual(
      info && resolveOutdatedAction(dependency(SHA_7_0_1), info, tagCommits),
      null,
    )
  })

  it('returns null for commit SHAs that are not tagged', () => {
    strictEqual(
      info && resolveOutdatedAction(dependency(SHA_UNTAGGED), info, {}),
      null,
    )
  })

  it('returns null when already on the latest release', () => {
    strictEqual(info && resolveOutdatedAction(dependency('7'), info), null)
    strictEqual(info && resolveOutdatedAction(dependency('7.0.1'), info), null)
  })
})
