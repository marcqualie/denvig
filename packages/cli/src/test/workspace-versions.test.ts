import { strictEqual } from 'node:assert'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'

/**
 * Guards against version drift across the workspace. `bin/tag-release` bumps the
 * root package.json and every package under packages/* in lockstep, so they must
 * always share the same version. A mismatch means a release only partially bumped
 * the versions — the exact failure where the publishable packages were left
 * behind and pnpm reported "no new packages that should be published".
 */

const findRepoRoot = (): string => {
  let dir = dirname(fileURLToPath(import.meta.url))
  while (!existsSync(join(dir, 'pnpm-workspace.yaml'))) {
    const parent = dirname(dir)
    if (parent === dir) throw new Error('could not locate workspace root')
    dir = parent
  }
  return dir
}

const repoRoot = findRepoRoot()

const readPackage = (path: string): { name: string; version: string } =>
  JSON.parse(readFileSync(path, 'utf8'))

const rootVersion = readPackage(join(repoRoot, 'package.json')).version

const packagesDir = join(repoRoot, 'packages')
const workspacePackages = readdirSync(packagesDir)
  .map((name) => join(packagesDir, name, 'package.json'))
  .filter((path) => existsSync(path))
  .map((path) => readPackage(path))

describe('workspace package versions', () => {
  it('discovers the workspace packages', () => {
    strictEqual(
      workspacePackages.length > 0,
      true,
      'expected at least one package under packages/*',
    )
  })

  for (const pkg of workspacePackages) {
    it(`${pkg.name} matches the root version (${rootVersion})`, () => {
      strictEqual(
        pkg.version,
        rootVersion,
        `${pkg.name} is ${pkg.version} but the workspace root is ${rootVersion}; bump every package.json in lockstep (bin/tag-release does this)`,
      )
    })
  }
})
