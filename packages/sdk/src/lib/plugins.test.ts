import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { listPlugins } from '../operations/plugins.ts'
import {
  loadPlugins,
  type PluginEntry,
  pluginMatches,
  pluginRegistry,
} from './plugins.ts'
import { Worktree } from './project/worktree.ts'

import type { Plugin } from './plugin.ts'

const fakePlugin = (name: string): Plugin => ({
  name,
  actions: async () => ({}),
})

/**
 * A registry whose loaders record every plugin they import.
 */
const spyRegistry = () => {
  const loaded: string[] = []
  const entry = (name: string, matchedFiles: string[]): PluginEntry => ({
    name,
    matchedFiles,
    load: async () => {
      loaded.push(name)
      return fakePlugin(name)
    },
  })
  return {
    loaded,
    registry: {
      alpha: entry('alpha', ['alpha.lock']),
      beta: entry('beta', ['.beta/config']),
      gamma: entry('gamma', ['gamma.json', 'gamma.lock']),
    },
  }
}

describe('pluginMatches()', () => {
  it('should match a root file', () => {
    strictEqual(pluginMatches(pluginRegistry.pnpm, ['pnpm-lock.yaml']), true)
  })

  it('should match nested paths on their top-level directory', () => {
    strictEqual(pluginMatches(pluginRegistry.githubActions, ['.github']), true)
  })

  it('should not match without a matched file', () => {
    strictEqual(pluginMatches(pluginRegistry.pnpm, ['package.json']), false)
  })
})

describe('loadPlugins()', () => {
  it('should not load any plugin when no files match', async () => {
    const { loaded, registry } = spyRegistry()
    const plugins = await loadPlugins({ rootFiles: ['README.md'] }, registry)
    deepStrictEqual(plugins, [])
    deepStrictEqual(loaded, [])
  })

  it('should only load plugins with a matched file', async () => {
    const { loaded, registry } = spyRegistry()
    await loadPlugins({ rootFiles: ['gamma.lock', 'README.md'] }, registry)
    deepStrictEqual(loaded, ['gamma'])
  })

  it('should return matched plugins in registry order', async () => {
    const { registry } = spyRegistry()
    const plugins = await loadPlugins(
      { rootFiles: ['gamma.json', '.beta', 'alpha.lock'] },
      registry,
    )
    deepStrictEqual(
      plugins.map(([key]) => key),
      ['alpha', 'beta', 'gamma'],
    )
  })

  it('should resolve real plugins for their matched files', async () => {
    const plugins = await loadPlugins({
      rootFiles: ['package.json', 'pnpm-lock.yaml', '.github', 'README.md'],
    })
    deepStrictEqual(
      plugins.map(([key, plugin]) => [key, plugin.name]),
      [
        ['githubActions', 'github-actions'],
        ['pnpm', 'pnpm'],
      ],
    )
  })

  it('should not load the npm plugin for a package.json without a lockfile', async () => {
    deepStrictEqual(await loadPlugins({ rootFiles: ['package.json'] }), [])
  })
})

/**
 * Every root file any plugin reads, as files or directories: each plugin's
 * matched files plus the supporting files plugins inspect once matched.
 */
const allPluginFiles = [
  ...Object.values(pluginRegistry).flatMap((entry) => entry.matchedFiles),
  'Gemfile',
  'Gemfile.lock',
  'Rakefile',
  'config.ru',
  'deno.json',
  'deno.lock',
  'package.json',
  'package-lock.json',
  'pnpm-lock.yaml',
  'pnpm-workspace.yaml',
  'pyproject.toml',
  'uv.lock',
  'yarn.lock',
  '.github/workflows',
  '.github/actions',
]

describe('plugin matched files', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'denvig-plugins-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  /**
   * Skipping a plugin must never change results, so each plugin has to do
   * nothing in a checkout that has every other file plugins read but none of
   * its own matched files.
   */
  for (const [key, entry] of Object.entries(pluginRegistry)) {
    it(`${key} should do nothing without one of its matched files`, async () => {
      const own = new Set(entry.matchedFiles.map((f) => f.split('/')[0]))
      const others = allPluginFiles.filter((f) => !own.has(f.split('/')[0]))
      for (const file of new Set(others)) {
        const path = join(dir, file)
        if (file.includes('/')) {
          mkdirSync(path, { recursive: true })
        } else {
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, file.endsWith('.json') ? '{}' : '')
        }
      }

      const worktree = await Worktree.retrieve(dir, 'main', true)
      const plugin = await entry.load()
      deepStrictEqual(await plugin.actions(worktree), {})
      deepStrictEqual((await plugin.dependencies?.(worktree)) ?? [], [])
    })
  }

  it('should list unmatched plugins with no actions', async () => {
    writeFileSync(join(dir, 'README.md'), '')
    const worktree = await Worktree.retrieve(dir, 'main', true)
    const plugins = await listPlugins(worktree)
    deepStrictEqual(Object.keys(plugins), Object.keys(pluginRegistry))
    for (const info of Object.values(plugins)) {
      deepStrictEqual(info.actions, {})
    }
  })
})
