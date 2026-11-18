import { deepStrictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseNpmLockfile } from './npm.ts'

import type { ProjectDependencySchema } from '../dependencies.ts'

/**
 * Index parsed versions by name for compact assertions.
 */
const byName = (deps: ProjectDependencySchema[]) =>
  Object.fromEntries(deps.map((dep) => [dep.name, dep.versions]))

describe('parseNpmLockfile()', () => {
  it('should parse direct and transitive dependencies from a v3 lockfile', () => {
    const deps = byName(
      parseNpmLockfile({
        lockfileVersion: 3,
        packages: {
          '': {
            name: 'app',
            dependencies: { express: '^4.18.0' },
            devDependencies: { '@types/node': '^20.0.0' },
          },
          'node_modules/express': {
            version: '4.18.2',
            dependencies: { debug: '2.6.9', 'safe-buffer': '5.2.1' },
          },
          'node_modules/express/node_modules/debug': { version: '2.6.9' },
          'node_modules/debug': { version: '4.3.4' },
          'node_modules/safe-buffer': { version: '5.2.1' },
          'node_modules/@types/node': { version: '20.11.0' },
        },
      }),
    )

    deepStrictEqual(deps.express, [
      { resolved: '4.18.2', specifier: '^4.18.0', source: '.#dependencies' },
    ])
    deepStrictEqual(deps['@types/node'], [
      {
        resolved: '20.11.0',
        specifier: '^20.0.0',
        source: '.#devDependencies',
      },
    ])
    deepStrictEqual(deps.debug, [
      {
        resolved: '2.6.9',
        specifier: '2.6.9',
        source: 'package-lock.json:express@4.18.2',
      },
    ])
    deepStrictEqual(deps['safe-buffer'], [
      {
        resolved: '5.2.1',
        specifier: '5.2.1',
        source: 'package-lock.json:express@4.18.2',
      },
    ])
  })

  it('should record nested packages under their real name', () => {
    const deps = byName(
      parseNpmLockfile({
        packages: {
          '': { dependencies: { a: '^1.0.0' } },
          'node_modules/a': {
            version: '1.0.0',
            dependencies: { '@scope/b': '^2.0.0' },
          },
          'node_modules/a/node_modules/@scope/b': { version: '2.1.0' },
          'node_modules/@scope/b': { version: '1.0.0' },
        },
      }),
    )

    deepStrictEqual(deps['@scope/b'], [
      {
        resolved: '2.1.0',
        specifier: '^2.0.0',
        source: 'package-lock.json:a@1.0.0',
      },
    ])
  })

  it('should report aliased packages under the real package name', () => {
    const deps = byName(
      parseNpmLockfile({
        packages: {
          '': { dependencies: { 'my-alias': 'npm:real-pkg@^3.0.0' } },
          'node_modules/my-alias': { name: 'real-pkg', version: '3.1.0' },
        },
      }),
    )

    deepStrictEqual(deps['real-pkg'], [
      {
        resolved: '3.1.0',
        specifier: 'npm:real-pkg@^3.0.0',
        source: '.#dependencies',
      },
    ])
    deepStrictEqual(deps['my-alias'], undefined)
  })

  it('should attribute workspace dependencies to the workspace path', () => {
    const deps = byName(
      parseNpmLockfile({
        packages: {
          '': {},
          'packages/web': {
            name: 'web',
            version: '0.0.0',
            dependencies: { lib: '*', react: '^18.0.0' },
          },
          'packages/lib': { name: 'lib', version: '1.2.0' },
          'node_modules/web': { link: true, resolved: 'packages/web' },
          'node_modules/lib': { link: true, resolved: 'packages/lib' },
          'node_modules/react': { version: '18.3.1' },
        },
      }),
    )

    deepStrictEqual(deps.react, [
      {
        resolved: '18.3.1',
        specifier: '^18.0.0',
        source: 'packages/web#dependencies',
      },
    ])
    deepStrictEqual(deps.lib, [
      {
        resolved: '1.2.0',
        specifier: '*',
        source: 'packages/web#dependencies',
      },
    ])
  })

  it('should skip optional dependencies that are not installed', () => {
    const deps = byName(
      parseNpmLockfile({
        packages: {
          '': { dependencies: { a: '^1.0.0' } },
          'node_modules/a': {
            version: '1.0.0',
            optionalDependencies: { fsevents: '^2.0.0' },
            peerDependencies: { react: '*' },
          },
        },
      }),
    )

    deepStrictEqual(Object.keys(deps), ['a'])
  })

  it('should parse v1 lockfiles using the root manifest for direct ranges', () => {
    const deps = byName(
      parseNpmLockfile(
        {
          lockfileVersion: 1,
          dependencies: {
            express: {
              version: '4.18.2',
              requires: { debug: '2.6.9' },
              dependencies: { debug: { version: '2.6.9' } },
            },
            debug: { version: '4.3.4' },
            jest: { version: '29.7.0' },
            'my-alias': { version: 'npm:real-pkg@3.1.0' },
          },
        },
        {
          dependencies: { express: '^4.18.0', 'my-alias': 'npm:real-pkg@^3' },
          devDependencies: { jest: '^29.0.0' },
        },
      ),
    )

    deepStrictEqual(deps.express, [
      { resolved: '4.18.2', specifier: '^4.18.0', source: '.#dependencies' },
    ])
    deepStrictEqual(deps.jest, [
      { resolved: '29.7.0', specifier: '^29.0.0', source: '.#devDependencies' },
    ])
    deepStrictEqual(deps.debug, [
      {
        resolved: '2.6.9',
        specifier: '2.6.9',
        source: 'package-lock.json:express@4.18.2',
      },
    ])
    deepStrictEqual(deps['real-pkg'], [
      {
        resolved: '3.1.0',
        specifier: 'npm:real-pkg@^3',
        source: '.#dependencies',
      },
    ])
  })
})
