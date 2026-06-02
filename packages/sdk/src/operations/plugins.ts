import plugins from '../lib/plugins.ts'

import type { Worktree } from '../lib/project/worktree.ts'

export type PluginInfo = {
  name: string
  actions: Record<string, string[]>
}

/**
 * List the available plugins and the actions each resolves for a worktree.
 * Shared by `denvig plugins` and `sdk.plugins()`.
 */
export const listPlugins = async (
  worktree: Worktree,
): Promise<Record<string, PluginInfo>> => {
  const pluginData: Record<string, PluginInfo> = {}
  for (const [key, plugin] of Object.entries(plugins)) {
    const actions = await plugin.actions(worktree)
    pluginData[key] = { name: plugin.name, actions }
  }
  return pluginData
}
