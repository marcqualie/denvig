import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseUsesReference, parseWorkflow } from './parse.ts'

describe('parseUsesReference()', () => {
  it('parses floating major tags as a range', () => {
    deepStrictEqual(parseUsesReference('actions/checkout@v6'), {
      name: 'actions/checkout',
      specifier: '6',
    })
  })

  it('parses exact tags', () => {
    deepStrictEqual(parseUsesReference('oven-sh/setup-bun@v2.2.0'), {
      name: 'oven-sh/setup-bun',
      specifier: '2.2.0',
    })
  })

  it('uses the version comment for commit SHA pins', () => {
    deepStrictEqual(
      parseUsesReference(
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
        'v7.0.1',
      ),
      { name: 'actions/checkout', specifier: '7.0.1' },
    )
  })

  it('ignores commit SHA pins without a version comment', () => {
    strictEqual(
      parseUsesReference(
        'actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1',
      ),
      null,
    )
  })

  it('uses the repository for actions in a subdirectory', () => {
    deepStrictEqual(parseUsesReference('github/codeql-action/init@v3'), {
      name: 'github/codeql-action',
      specifier: '3',
    })
  })

  it('ignores local actions, docker images and branch refs', () => {
    strictEqual(parseUsesReference('./.github/actions/setup'), null)
    strictEqual(parseUsesReference('docker://alpine:3.20'), null)
    strictEqual(parseUsesReference('owner/repo@main'), null)
  })
})

describe('parseWorkflow()', () => {
  it('extracts references from steps and reusable workflows', () => {
    const result = parseWorkflow(`
jobs:
  build:
    uses: owner/workflows/.github/workflows/build.yml@v1.2
  test:
    steps:
      - name: Checkout
        uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
      - uses: "actions/setup-node@v6"
      - uses: ./.github/actions/local
      # - uses: actions/cache@v4
`)

    deepStrictEqual(result, [
      { name: 'owner/workflows', specifier: '1.2' },
      { name: 'actions/checkout', specifier: '7.0.1' },
      { name: 'actions/setup-node', specifier: '6' },
    ])
  })
})
