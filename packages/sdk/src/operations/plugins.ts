import { loadPlugins, pluginRegistry } from '../lib/plugins.ts'

import type { Worktree } from '../lib/project/worktree.ts'

export type PluginInfo = {
  name: string
  actions: Record<string, string[]>
}

/**
 * List every available plugin and the actions each resolves for a worktree.
 * Plugins with no matched files in the worktree report no actions without
 * being loaded. Shared by `denvig plugins` and `sdk.plugins()`.
 */
export const listPlugins = async (
  worktree: Worktree,
): Promise<Record<string, PluginInfo>> => {
  const loaded = new Map(await loadPlugins(worktree))
  const pluginData: Record<string, PluginInfo> = {}
  for (const [key, entry] of Object.entries(pluginRegistry)) {
    const plugin = loaded.get(key)
    const actions = plugin ? await plugin.actions(worktree) : {}
    pluginData[key] = { name: entry.name, actions }
  }
  return pluginData
}
