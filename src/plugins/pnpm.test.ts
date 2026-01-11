import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import fs from 'node:fs'
import { describe, it } from 'node:test'

import pnpmPlugin from './pnpm.ts'

import type { DenvigProject } from '../lib/project.ts'

const turborepoExamplePath = new URL(
  '../test/examples/turborepo',
  import.meta.url,
).pathname

/**
 * Create a minimal mock project for testing that points to a real directory
 */
function createMockProject(projectPath: string): DenvigProject {
  return {
    path: projectPath,
    rootFiles: fs.readdirSync(projectPath),
    findFilesByName(fileName: string): string[] {
      const results: string[] = []
      const walk = (dir: string) => {
        const files = fs.readdirSync(dir, { withFileTypes: true })
        for (const file of files) {
          if (file.isDirectory()) {
            if (file.name !== 'node_modules') {
              walk(`${dir}/${file.name}`)
            }
          } else if (file.name === fileName) {
            results.push(`${dir}/${file.name}`)
          }
        }
      }
      walk(projectPath)
      return results
    },
  } as DenvigProject
}

describe('pnpm plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(pnpmPlugin.name, 'pnpm')
  })

  it('should have actions function', () => {
    strictEqual(typeof pnpmPlugin.actions, 'function')
  })

  describe('dependencies', () => {
    it('should detect pnpm as a system dependency when pnpm-lock.yaml exists', async () => {
      const project = createMockProject(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const pnpmDep = deps.find((d) => d.id === 'npm:pnpm')
      ok(pnpmDep, 'pnpm system dependency should be detected')
      strictEqual(pnpmDep.ecosystem, 'system')
    })

    it('should read devDependencies from root package.json', async () => {
      const project = createMockProject(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      // Root package.json has only devDependencies (turbo)
      // The plugin reads both dependencies and devDependencies when dependencies exists
      const turboDep = deps.find((d) => d.name === 'turbo')
      strictEqual(turboDep?.ecosystem, 'npm')
    })

    it('should read dependencies from workspace packages', async () => {
      const project = createMockProject(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const pkg2Dep = deps.find((d) => d.name === 'denvig')
      ok(pkg2Dep, 'denvig should be detected from package2')
      strictEqual(pkg2Dep.ecosystem, 'npm')
      deepStrictEqual(pkg2Dep.versions, {
        '0.3.0': { 'packages/package2#dependencies': '0.3.0' },
      })
    })

    it('should combine multiple of the same dependency into one', async () => {
      const project = createMockProject(turborepoExamplePath)
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
      // Two specifiers resolve to 19.2.3, one resolves to 18.3.1
      deepStrictEqual(reactDep.versions, {
        '19.2.3': {
          'packages/package1#dependencies': '^19.2',
          'packages/package2#dependencies': '^19.2.0',
        },
        '18.3.1': {
          'packages/package3#dependencies': '^18',
        },
      })
    })

    it('should return dependencies that are in the lock file but not in any package.json', async () => {
      const project = createMockProject(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const yamlDep = deps.find((d) => d.name === 'yaml')
      ok(yamlDep, 'yaml should be detected from lockfile only')
      strictEqual(yamlDep.ecosystem, 'npm')
      deepStrictEqual(yamlDep.versions, {
        '2.8.2': { 'pnpm-lock.yaml:denvig@0.3.0': '2.8.2' },
      })
    })

    it('should not include bracketed versions', async () => {
      const project = createMockProject(turborepoExamplePath)
      ok(pnpmPlugin.dependencies, 'dependencies function should exist')
      const deps = await pnpmPlugin.dependencies(project)

      const tsDep = deps.find((d) => d.name === 'tsup')
      ok(tsDep, 'tsup should be detected from package.json and lockfile')
      strictEqual(tsDep.ecosystem, 'npm')
      deepStrictEqual(tsDep.versions, {
        '8.5.1': {
          '.#devDependencies': '^8.5.0',
        },
      })
    })

    it('should return dependencies sorted alphabetically by name', async () => {
      const project = createMockProject(turborepoExamplePath)
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
      const project = createMockProject(turborepoExamplePath)
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
      const project = createMockProject(turborepoExamplePath)
      const actions = await pnpmPlugin.actions(project)

      deepStrictEqual(actions.install, ['pnpm install'])
      deepStrictEqual(actions.outdated, ['pnpm outdated -r'])
    })
  })
})
