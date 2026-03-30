import { notStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'
import { parse as parseYAML } from 'yaml'

import { preparePnpmRemovals } from './prepare-removals-pnpm.ts'

describe('preparePnpmRemovals()', () => {
  it('removes specified dependencies from packages and snapshots', () => {
    const source = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      react:
        specifier: ^18.2.0
        version: 18.2.0

packages:
  react@18.1.3:
    resolution: {integrity: sha512-test1==}

  react@18.2.0:
    resolution: {integrity: sha512-test2==}

snapshots:
  react@18.1.3: {}
  react@18.2.0: {}
`

    const result = preparePnpmRemovals(source, { react: ['18.2.0'] })
    const parsed = parseYAML(result)

    strictEqual(parsed.packages['react@18.2.0'], undefined)
    notStrictEqual(parsed.packages['react@18.1.3'], undefined)
    strictEqual(parsed.snapshots['react@18.2.0'], undefined)
    notStrictEqual(parsed.snapshots['react@18.1.3'], undefined)
  })

  it('updates importer version references when optimised versions provided', () => {
    const source = `lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      semver:
        specifier: ^7.7.3
        version: 7.7.3

  packages/yarn:
    dependencies:
      semver:
        specifier: ^7.7.2
        version: 7.7.2

packages:
  semver@7.7.2:
    resolution: {integrity: sha512-test1==}

  semver@7.7.3:
    resolution: {integrity: sha512-test2==}

snapshots:
  semver@7.7.2: {}
  semver@7.7.3: {}
`

    const result = preparePnpmRemovals(
      source,
      { semver: ['7.7.2'] },
      { semver: { '7.7.3': ['^7.7.2', '^7.7.3'] } },
    )
    const parsed = parseYAML(result)

    strictEqual(parsed.packages['semver@7.7.2'], undefined)
    notStrictEqual(parsed.packages['semver@7.7.3'], undefined)
    strictEqual(
      parsed.importers['packages/yarn'].dependencies.semver.version,
      '7.7.3',
    )
  })
})
