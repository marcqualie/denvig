import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { createMockProjectFromPath } from '../test/mock.ts'
import npmPlugin from './npm.ts'

describe('npm plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(npmPlugin.name, 'npm')
  })

  it('should have actions function', () => {
    strictEqual(typeof npmPlugin.actions, 'function')
  })

  describe('dependencies()', () => {
    let root: string

    before(() => {
      root = mkdtempSync(join(tmpdir(), 'denvig-npm-'))
      writeFileSync(
        join(root, 'package.json'),
        JSON.stringify({ dependencies: { lodash: '^4.17.0' } }),
      )
      writeFileSync(
        join(root, 'package-lock.json'),
        JSON.stringify({
          lockfileVersion: 3,
          packages: {
            '': { dependencies: { lodash: '^4.17.0' } },
            'node_modules/lodash': { version: '4.17.21' },
          },
        }),
      )
    })

    after(() => {
      rmSync(root, { recursive: true, force: true })
    })

    it('should return dependencies from package-lock.json', async () => {
      const deps = await npmPlugin.dependencies?.(
        createMockProjectFromPath(root),
      )

      deepStrictEqual(deps, [
        { id: 'npm:npm', name: 'npm', ecosystem: 'system', versions: [] },
        {
          id: 'npm:lodash',
          name: 'lodash',
          ecosystem: 'npm',
          versions: [
            {
              resolved: '4.17.21',
              specifier: '^4.17.0',
              source: '.#dependencies',
            },
          ],
        },
      ])
    })

    it('should return nothing without a package-lock.json', async () => {
      const empty = mkdtempSync(join(tmpdir(), 'denvig-npm-empty-'))
      try {
        const deps = await npmPlugin.dependencies?.(
          createMockProjectFromPath(empty),
        )
        deepStrictEqual(deps, [])
      } finally {
        rmSync(empty, { recursive: true, force: true })
      }
    })
  })
})
