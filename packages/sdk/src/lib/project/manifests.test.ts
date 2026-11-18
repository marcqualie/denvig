import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { findManifestDirs } from './manifests.ts'

describe('findManifestDirs()', () => {
  it('should always include the root', () => {
    deepStrictEqual(findManifestDirs([]), ['.'])
  })

  it('should detect lockfiles and manifests in subdirectories', () => {
    deepStrictEqual(
      findManifestDirs([
        'app/pyproject.toml',
        'app/uv.lock',
        'app/assets/package-lock.json',
      ]),
      ['.', 'app', 'app/assets'],
    )
  })

  it('should treat every nested lockfile as a separate install', () => {
    deepStrictEqual(
      findManifestDirs(['pnpm-lock.yaml', 'tools/package-lock.json']),
      ['.', 'tools'],
    )
  })

  it('should skip workspace members covered by a parent lockfile', () => {
    deepStrictEqual(
      findManifestDirs([
        'pyproject.toml',
        'uv.lock',
        'packages/api/pyproject.toml',
        'deno.lock',
        'libs/core/deno.json',
      ]),
      ['.'],
    )
  })

  it('should detect manifests without a lockfile', () => {
    deepStrictEqual(
      findManifestDirs(['scripts/pyproject.toml', 'ops/Gemfile']),
      ['.', 'ops', 'scripts'],
    )
  })

  it('should ignore test fixtures and vendored code', () => {
    deepStrictEqual(
      findManifestDirs([
        'src/test/examples/pnpm/pnpm-lock.yaml',
        'spec/fixtures/Gemfile',
        'vendor/bundle/Gemfile.lock',
        'node_modules/foo/package-lock.json',
      ]),
      ['.'],
    )
  })
})
