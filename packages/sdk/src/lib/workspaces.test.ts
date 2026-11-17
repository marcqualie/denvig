import { deepStrictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { findWorkspacePackageJsons, workspacePatterns } from './workspaces.ts'

describe('workspaces', () => {
  describe('workspacePatterns()', () => {
    it('should read the array form', () => {
      deepStrictEqual(workspacePatterns({ workspaces: ['packages/*'] }), [
        'packages/*',
      ])
    })

    it('should read the object form', () => {
      deepStrictEqual(
        workspacePatterns({ workspaces: { packages: ['apps/*'] } }),
        ['apps/*'],
      )
    })

    it('should return an empty list without workspaces', () => {
      deepStrictEqual(workspacePatterns({}), [])
      deepStrictEqual(workspacePatterns(null), [])
    })
  })

  describe('findWorkspacePackageJsons()', () => {
    let root: string

    const pkg = (dir: string) => {
      mkdirSync(join(root, dir), { recursive: true })
      writeFileSync(join(root, dir, 'package.json'), '{}')
    }

    before(() => {
      root = mkdtempSync(join(tmpdir(), 'denvig-workspaces-'))
      pkg('.')
      pkg('packages/a')
      pkg('packages/b')
      pkg('packages/legacy')
      pkg('packages/a/node_modules/dep')
      pkg('apps/web')
      pkg('apps/nested/deep/tool')
      pkg('tools/cli')
      mkdirSync(join(root, 'packages/no-manifest'), { recursive: true })
      // Nested git worktrees are full copies of the repo and must be ignored.
      pkg('.worktrees/feature/packages/a')
      pkg('.claude/worktrees/agent/packages/a')
    })

    after(() => {
      rmSync(root, { recursive: true, force: true })
    })

    it('should expand single-level globs', async () => {
      deepStrictEqual(await findWorkspacePackageJsons(root, ['packages/*']), [
        `${root}/packages/a/package.json`,
        `${root}/packages/b/package.json`,
        `${root}/packages/legacy/package.json`,
      ])
    })

    it('should apply negated patterns', async () => {
      deepStrictEqual(
        await findWorkspacePackageJsons(root, [
          'packages/*',
          '!packages/legacy',
        ]),
        [`${root}/packages/a/package.json`, `${root}/packages/b/package.json`],
      )
    })

    it('should expand ** recursively without entering node_modules', async () => {
      deepStrictEqual(await findWorkspacePackageJsons(root, ['apps/**']), [
        `${root}/apps/nested/deep/tool/package.json`,
        `${root}/apps/web/package.json`,
      ])
    })

    it('should never walk into dot-directories such as worktrees', async () => {
      const found = await findWorkspacePackageJsons(root, ['**'])
      deepStrictEqual(
        found.filter((path) => path.includes('/.')),
        [],
      )
      deepStrictEqual(found.includes(`${root}/package.json`), false)
      deepStrictEqual(found.includes(`${root}/tools/cli/package.json`), true)
    })

    it('should resolve literal paths and partial wildcards', async () => {
      deepStrictEqual(
        await findWorkspacePackageJsons(root, ['./tools/cli', 'packages/l*']),
        [
          `${root}/packages/legacy/package.json`,
          `${root}/tools/cli/package.json`,
        ],
      )
    })
  })
})
