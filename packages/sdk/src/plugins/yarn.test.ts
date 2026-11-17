import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { createMockProjectFromPath } from '../test/mock.ts'
import yarnPlugin from './yarn.ts'

const YARN_LOCK = `# yarn lockfile v1

lodash@^4.17.0:
  version "4.17.21"

react@^18.0.0:
  version "18.3.1"

left-pad@^1.3.0:
  version "1.3.0"
`

describe('yarn plugin', () => {
  it('should have correct plugin name', () => {
    strictEqual(yarnPlugin.name, 'yarn')
  })

  it('should have actions function', () => {
    strictEqual(typeof yarnPlugin.actions, 'function')
  })

  describe('dependencies()', () => {
    let root: string

    const writeJson = (path: string, data: unknown) => {
      mkdirSync(join(root, path, '..'), { recursive: true })
      writeFileSync(join(root, path), JSON.stringify(data))
    }

    before(() => {
      root = mkdtempSync(join(tmpdir(), 'denvig-yarn-'))
      writeFileSync(join(root, 'yarn.lock'), YARN_LOCK)
      writeJson('package.json', {
        workspaces: ['packages/*'],
        dependencies: { lodash: '^4.17.0' },
      })
      writeJson('packages/web/package.json', {
        dependencies: { react: '^18.0.0' },
      })
      // A nested git worktree with its own extra dependency.
      writeJson('.worktrees/feature/packages/web/package.json', {
        dependencies: { 'left-pad': '^1.3.0' },
      })
    })

    after(() => {
      rmSync(root, { recursive: true, force: true })
    })

    it('should only read the root package.json', async () => {
      const deps = await yarnPlugin.dependencies?.(
        createMockProjectFromPath(root),
      )
      const sources = (name: string) =>
        deps
          ?.find((dep) => dep.name === name)
          ?.versions.map((version) => version.source)

      deepStrictEqual(sources('lodash'), ['.#dependencies'])
      strictEqual(sources('react'), undefined)
      strictEqual(sources('left-pad'), undefined)
    })
  })
})
