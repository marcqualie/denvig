import type { Plugin } from './plugin.ts'
import type { Worktree } from './project/worktree.ts'

/**
 * A plugin that can be loaded on demand.
 */
export type PluginEntry = {
  name: string
  /**
   * Files or directories, relative to a checkout root, that this plugin reads.
   * The plugin is only loaded for checkouts where at least one of them exists.
   * Nested paths match on their top-level directory (eg. `.github`).
   */
  matchedFiles: string[]
  load: () => Promise<Plugin>
}

/**
 * Every plugin, in the order their actions and dependencies are merged.
 * Plugins are imported lazily so checkouts only pay for the ecosystems they use.
 */
export const pluginRegistry: Record<string, PluginEntry> = {
  deno: {
    name: 'deno',
    matchedFiles: ['deno.json', 'deno.jsonc', 'deno.lock'],
    load: () => import('../plugins/deno.ts').then((m) => m.default),
  },
  githubActions: {
    name: 'github-actions',
    matchedFiles: ['.github/workflows', '.github/actions'],
    load: () => import('../plugins/github-actions.ts').then((m) => m.default),
  },
  npm: {
    name: 'npm',
    matchedFiles: ['package-lock.json'],
    load: () => import('../plugins/npm.ts').then((m) => m.default),
  },
  pnpm: {
    name: 'pnpm',
    matchedFiles: ['pnpm-lock.yaml'],
    load: () => import('../plugins/pnpm.ts').then((m) => m.default),
  },
  ruby: {
    name: 'ruby',
    matchedFiles: ['Gemfile', 'Rakefile'],
    load: () => import('../plugins/ruby.ts').then((m) => m.default),
  },
  uv: {
    name: 'uv',
    matchedFiles: ['pyproject.toml', 'uv.lock'],
    load: () => import('../plugins/uv.ts').then((m) => m.default),
  },
  yarn: {
    name: 'yarn',
    matchedFiles: ['yarn.lock'],
    load: () => import('../plugins/yarn.ts').then((m) => m.default),
  },
}

/**
 * Whether any of a plugin's matched files exist in a checkout's root listing.
 */
export const pluginMatches = (
  entry: PluginEntry,
  rootFiles: string[],
): boolean =>
  entry.matchedFiles.some((file) => rootFiles.includes(file.split('/')[0]))

/**
 * Load the plugins that apply to a checkout, keyed by registry key and in
 * registry order. Plugins without a matched file are never imported.
 */
export const loadPlugins = async (
  worktree: Pick<Worktree, 'rootFiles'>,
  registry: Record<string, PluginEntry> = pluginRegistry,
): Promise<[string, Plugin][]> => {
  const matched = Object.entries(registry).filter(([, entry]) =>
    pluginMatches(entry, worktree.rootFiles),
  )
  return Promise.all(
    matched.map(
      async ([key, entry]): Promise<[string, Plugin]> => [
        key,
        await entry.load(),
      ],
    ),
  )
}
