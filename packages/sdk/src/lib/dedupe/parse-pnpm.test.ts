import { deepStrictEqual, strictEqual } from 'node:assert'
import { it } from 'node:test'

import { parsePnpmLockForDedupe } from './parse-pnpm.ts'

it('handles simple dependencies with no duplicates', () => {
  const result = parsePnpmLockForDedupe(`
lockfileVersion: '9.0'

settings:
  autoInstallPeers: true
  excludeLinksFromLockfile: false

importers:
  .:
    dependencies:
      react:
        specifier: ^18.2.0
        version: 18.2.0
    devDependencies:
      '@types/react':
        specifier: ^18.2.15
        version: 18.2.79

packages:
  '@types/react@18.2.79':
    resolution: {integrity: sha512-test==}

  react@18.2.0:
    resolution: {integrity: sha512-test==}
    engines: {node: '>=0.10.0'}
`)

  strictEqual(Object.keys(result.dependencies).length, 2)
  deepStrictEqual(result.dependencies['@types/react'].versions, {
    '18.2.79': ['^18.2.15'],
  })
  deepStrictEqual(result.dependencies.react.versions, {
    '18.2.0': ['^18.2.0'],
  })
})

it('handles multiple versions of the same dependency with optimisation', () => {
  const result = parsePnpmLockForDedupe(`
lockfileVersion: '9.0'

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
`)

  strictEqual(Object.keys(result.dependencies).length, 1)
  deepStrictEqual(result.dependencies.semver.versions, {
    '7.7.2': ['^7.7.2'],
    '7.7.3': ['^7.7.3'],
  })
  deepStrictEqual(result.dependencies.semver.optimisedVersions, {
    '7.7.3': ['^7.7.2', '^7.7.3'],
  })
})

it('skips workspace dependencies', () => {
  const result = parsePnpmLockForDedupe(`
lockfileVersion: '9.0'

importers:
  .:
    dependencies:
      '@my/cli':
        specifier: workspace:*
        version: link:packages/cli
      semver:
        specifier: ^7.7.3
        version: 7.7.3

packages:
  semver@7.7.3:
    resolution: {integrity: sha512-test==}
`)

  strictEqual(Object.keys(result.dependencies).length, 1)
  strictEqual(result.dependencies['@my/cli'], undefined)
})
