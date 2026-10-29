import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import pnpmPlugin from '../../plugins/pnpm.ts'
import { createMockProjectFromPath } from '../../test/mock.ts'
import { buildDependabotSnapshot, toPackageUrl } from './dependabot.ts'

import type { ProjectDependencySchema } from '../dependencies.ts'
import type { DependabotSnapshotContext } from './dependabot.ts'

const multiDocExamplePath = new URL(
  '../../test/examples/pnpm-multi-doc',
  import.meta.url,
).pathname

const catalogExamplePath = new URL(
  '../../test/examples/pnpm-catalog',
  import.meta.url,
).pathname

const context: DependabotSnapshotContext = {
  sha: 'a'.repeat(40),
  ref: 'refs/heads/main',
  correlator: 'denvig:deps',
  jobId: '123',
  jobUrl: 'https://github.com/acme/app/actions/runs/123',
  pathPrefix: '',
}

const detector = {
  name: 'denvig',
  version: '0.0.0',
  url: 'https://github.com/marcqualie/denvig',
}

const build = (
  dependencies: ProjectDependencySchema[],
  overrides: Partial<DependabotSnapshotContext> = {},
) =>
  buildDependabotSnapshot({
    dependencies,
    context: { ...context, ...overrides },
    detector,
    scanned: '2026-10-29T00:00:00.000Z',
  })

const loadDependencies = async (path: string) => {
  ok(pnpmPlugin.dependencies, 'dependencies function should exist')
  return pnpmPlugin.dependencies(createMockProjectFromPath(path))
}

describe('toPackageUrl', () => {
  it('should build npm purls', () => {
    strictEqual(
      toPackageUrl('npm', 'express', '5.1.0'),
      'pkg:npm/express@5.1.0',
    )
  })

  it('should encode the scope of npm packages', () => {
    strictEqual(
      toPackageUrl('npm', '@fastify/busboy', '3.2.0'),
      'pkg:npm/%40fastify/busboy@3.2.0',
    )
  })

  it('should strip pnpm peer suffixes', () => {
    strictEqual(
      toPackageUrl('npm', 'tsup', '8.5.1(yaml@2.9.0)'),
      'pkg:npm/tsup@8.5.1',
    )
  })

  it('should map rubygems and pypi ecosystems', () => {
    strictEqual(
      toPackageUrl('rubygems', 'rails', '8.0.0'),
      'pkg:gem/rails@8.0.0',
    )
    strictEqual(
      toPackageUrl('pypi', 'django', '5.2.1'),
      'pkg:pypi/django@5.2.1',
    )
  })

  it('should return null for unsupported ecosystems', () => {
    strictEqual(toPackageUrl('actions', 'actions/checkout', '5.0.0'), null)
    strictEqual(toPackageUrl('system', 'pnpm', '12.0.0'), null)
  })

  it('should return null for non-concrete versions', () => {
    strictEqual(toPackageUrl('npm', 'pkg', 'link:../pkg'), null)
    strictEqual(toPackageUrl('npm', 'pkg', 'file:../pkg.tgz'), null)
    strictEqual(toPackageUrl('npm', 'pkg', 'workspace:*'), null)
  })
})

describe('buildDependabotSnapshot', () => {
  it('should include commit, job and detector metadata', () => {
    const snapshot = build([])

    strictEqual(snapshot.version, 0)
    strictEqual(snapshot.sha, context.sha)
    strictEqual(snapshot.ref, 'refs/heads/main')
    deepStrictEqual(snapshot.job, {
      correlator: 'denvig:deps',
      id: '123',
      html_url: 'https://github.com/acme/app/actions/runs/123',
    })
    deepStrictEqual(snapshot.detector, detector)
    strictEqual(snapshot.scanned, '2026-10-29T00:00:00.000Z')
    deepStrictEqual(snapshot.manifests, {})
  })

  it('should resolve every package from a multi-document pnpm lockfile', async () => {
    const snapshot = build(await loadDependencies(multiDocExamplePath))

    deepStrictEqual(Object.keys(snapshot.manifests), ['pnpm-lock.yaml'])
    const resolved = snapshot.manifests['pnpm-lock.yaml'].resolved
    deepStrictEqual(Object.keys(resolved), [
      'pkg:npm/bundle-require@5.2.0',
      'pkg:npm/fsevents@2.3.3',
      'pkg:npm/tsup@8.5.1',
      'pkg:npm/yaml@2.9.0',
      'pkg:npm/zod@4.6.1',
    ])
  })

  it('should mark direct and indirect relationships', async () => {
    const snapshot = build(await loadDependencies(multiDocExamplePath))
    const resolved = snapshot.manifests['pnpm-lock.yaml'].resolved

    strictEqual(resolved['pkg:npm/tsup@8.5.1'].relationship, 'direct')
    strictEqual(resolved['pkg:npm/zod@4.6.1'].relationship, 'direct')
    strictEqual(
      resolved['pkg:npm/bundle-require@5.2.0'].relationship,
      'indirect',
    )
    deepStrictEqual(resolved['pkg:npm/tsup@8.5.1'].dependencies, [
      'pkg:npm/bundle-require@5.2.0',
      'pkg:npm/fsevents@2.3.3',
      'pkg:npm/yaml@2.9.0',
    ])
  })

  it('should only use development scope when every path is from devDependencies', async () => {
    const snapshot = build(await loadDependencies(multiDocExamplePath))
    const resolved = snapshot.manifests['pnpm-lock.yaml'].resolved

    strictEqual(resolved['pkg:npm/tsup@8.5.1'].scope, 'development')
    strictEqual(resolved['pkg:npm/bundle-require@5.2.0'].scope, 'development')
    // yaml is a runtime dependency and also pulled in by tsup (dev)
    strictEqual(resolved['pkg:npm/yaml@2.9.0'].scope, 'runtime')
    strictEqual(resolved['pkg:npm/zod@4.6.1'].scope, 'runtime')
  })

  it('should report each resolved version once across workspace packages', () => {
    const snapshot = build([
      {
        id: 'npm:next',
        name: 'next',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '16.3.8',
            specifier: 'catalog:',
            source: 'apps/web#dependencies',
          },
          {
            resolved: '16.3.8',
            specifier: 'catalog:',
            source: 'apps/admin#devDependencies',
          },
        ],
      },
      {
        id: 'npm:react',
        name: 'react',
        ecosystem: 'npm',
        versions: [
          {
            resolved: '19.2.3',
            specifier: '19.2.3',
            source: 'pnpm-lock.yaml:next@16.3.8(react@19.2.3)',
          },
        ],
      },
    ])

    deepStrictEqual(Object.keys(snapshot.manifests), ['pnpm-lock.yaml'])
    deepStrictEqual(snapshot.manifests['pnpm-lock.yaml'].file, {
      source_location: 'pnpm-lock.yaml',
    })
    deepStrictEqual(snapshot.manifests['pnpm-lock.yaml'].resolved, {
      'pkg:npm/next@16.3.8': {
        package_url: 'pkg:npm/next@16.3.8',
        relationship: 'direct',
        scope: 'runtime',
        dependencies: ['pkg:npm/react@19.2.3'],
      },
      'pkg:npm/react@19.2.3': {
        package_url: 'pkg:npm/react@19.2.3',
        relationship: 'indirect',
        scope: 'runtime',
        dependencies: [],
      },
    })
  })

  it('should fall back to the manifest file when no lockfile is detected', async () => {
    const snapshot = build(await loadDependencies(catalogExamplePath))

    deepStrictEqual(Object.keys(snapshot.manifests), ['package.json'])
    deepStrictEqual(Object.keys(snapshot.manifests['package.json'].resolved), [
      'pkg:npm/nock@14.0.14',
      'pkg:npm/react@18.3.1',
      'pkg:npm/react@19.2.3',
    ])
  })

  it('should prefix manifest paths with the project path in the repository', async () => {
    const snapshot = build(await loadDependencies(multiDocExamplePath), {
      pathPrefix: 'services/api',
    })

    deepStrictEqual(Object.keys(snapshot.manifests), [
      'services/api/pnpm-lock.yaml',
    ])
  })

  it('should skip workspace links and unsupported ecosystems', () => {
    const snapshot = build([
      {
        id: 'npm:shared',
        name: 'shared',
        ecosystem: 'npm',
        versions: [
          {
            resolved: 'link:../shared',
            specifier: 'workspace:*',
            source: 'apps/web#dependencies',
          },
        ],
      },
      {
        id: 'actions:actions/checkout',
        name: 'actions/checkout',
        ecosystem: 'actions',
        versions: [
          {
            resolved: '5.0.0',
            specifier: 'v5',
            source: '.github/workflows/ci.yml#dependencies',
          },
        ],
      },
      {
        id: 'npm:pnpm',
        name: 'pnpm',
        ecosystem: 'system',
        versions: [],
      },
    ])

    deepStrictEqual(snapshot.manifests, {})
  })

  it('should use the ecosystem lockfile for non-npm dependencies', () => {
    const snapshot = build([
      {
        id: 'rubygems:rails',
        name: 'rails',
        ecosystem: 'rubygems',
        versions: [
          { resolved: '8.0.0', specifier: '~> 8.0', source: '.#dependencies' },
        ],
      },
      {
        id: 'rubygems:actionpack',
        name: 'actionpack',
        ecosystem: 'rubygems',
        versions: [
          {
            resolved: '8.0.0',
            specifier: '= 8.0.0',
            source: 'Gemfile.lock:rails@8.0.0',
          },
        ],
      },
    ])

    deepStrictEqual(Object.keys(snapshot.manifests['Gemfile.lock'].resolved), [
      'pkg:gem/actionpack@8.0.0',
      'pkg:gem/rails@8.0.0',
    ])
  })

  it('should produce deterministic output', async () => {
    const dependencies = await loadDependencies(catalogExamplePath)

    strictEqual(
      JSON.stringify(build(dependencies)),
      JSON.stringify(build([...dependencies].reverse())),
    )
  })
})
