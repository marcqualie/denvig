import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { createMockProjectFromPath } from '../test/mock.ts'
import pnpmPlugin from './pnpm.ts'

const turborepoExamplePath = new URL(
  '../test/examples/turborepo',
  import.meta.url,
).pathname

describe('pnpm plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(pnpmPlugin.name, 'pnpm')
  })

  it('should have actions function', () => {
    strictEqual(typeof pnpmPlugin.actions, 'function')
  })

  describe('dependencies', () => {
    it('should detect pnpm as a system dependency when pnpm-lock.yaml exists', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const pnpmDep = deps.find((d) => d.id === 'npm:pnpm')
      ok(pnpmDep, 'pnpm system dependency should be detected')
      strictEqual(pnpmDep.ecosystem, 'system')
    })

    it('should read devDependencies from root package.json', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      // Root package.json has only devDependencies (turbo)
      // The plugin reads both dependencies and devDependencies when dependencies exists
      const turboDep = deps.find((d) => d.name === 'turbo')
      strictEqual(turboDep?.ecosystem, 'npm')
    })

    it('should read dependencies from workspace packages', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const pkg2Dep = deps.find((d) => d.name === 'denvig')
      ok(pkg2Dep, 'denvig should be detected from package2')
      strictEqual(pkg2Dep.ecosystem, 'npm')
      deepStrictEqual(pkg2Dep.versions, [
        {
          resolved: '0.3.0',
          specifier: '0.3.0',
          source: 'packages/package2#dependencies',
        },
      ])
    })

    it('should combine multiple of the same dependency into one', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const reactDeps = deps.filter((d) => d.name === 'react')
      strictEqual(
        reactDeps.length,
        1,
        'react should be combined into one entry',
      )
      const reactDep = reactDeps[0]

      ok(reactDep, 'react dependency should exist')
      strictEqual(reactDep.name, 'react')
      strictEqual(reactDep.ecosystem, 'npm')
      // Multiple version entries from different sources
      deepStrictEqual(reactDep.versions, [
        {
          resolved: '19.2.3',
          specifier: '^19.2',
          source: 'packages/package1#dependencies',
        },
        {
          resolved: '19.2.3',
          specifier: '^19.2.0',
          source: 'packages/package2#dependencies',
        },
        {
          resolved: '18.3.1',
          specifier: '^18',
          source: 'packages/package3#dependencies',
        },
      ])
    })

    it('should return dependencies that are in the lock file but not in any package.json', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const yamlDep = deps.find((d) => d.name === 'yaml')
      ok(yamlDep, 'yaml should be detected from lockfile only')
      strictEqual(yamlDep.ecosystem, 'npm')
      deepStrictEqual(yamlDep.versions, [
        {
          resolved: '2.8.2',
          specifier: '2.8.2',
          source: 'pnpm-lock.yaml:denvig@0.3.0',
        },
      ])
    })

    it('should not include bracketed versions', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const tsDep = deps.find((d) => d.name === 'tsup')
      ok(tsDep, 'tsup should be detected from package.json and lockfile')
      strictEqual(tsDep.ecosystem, 'npm')
      deepStrictEqual(tsDep.versions, [
        {
          resolved: '8.5.1',
          specifier: '^8.5.0',
          source: '.#devDependencies',
        },
      ])
    })

    it('should return dependencies sorted alphabetically by name', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const names = deps.map((d) => d.name)
      const sortedNames = [...names].sort((a, b) => a.localeCompare(b))
      deepStrictEqual(
        names,
        sortedNames,
        'dependencies should be sorted alphabetically',
      )
    })

    it('should return all expected dependencies from turborepo example', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const npmDeps = deps.filter((d) => d.ecosystem === 'npm')
      const depNames = npmDeps.map((d) => d.name)

      ok(
        depNames.includes('react'),
        'should include react from workspace packages',
      )
      ok(depNames.includes('denvig'), 'should include denvig from package2')
    })
  })

  describe('actions', () => {
    it('should return install and outdated actions for workspace', async () => {
      const project = createMockProjectFromPath(turborepoExamplePath)
      const actions = await pnpmPlugin.actions(project)

      deepStrictEqual(actions.install, ['pnpm install'])
      deepStrictEqual(actions.outdated, ['pnpm outdated -r'])
    })
  })
})
