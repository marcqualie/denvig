import { Command } from '../lib/command.ts'
import plugins from '../lib/plugins.ts'

export const pluginsCommand = new Command({
  name: 'plugins',
  description: 'Show a list of available plugins and their actions',
  usage: 'plugins',
  example: 'denvig plugins',
  args: [],
  flags: [],
  handler: async ({ project, flags }) => {
    const pluginData: Record<
      string,
      { name: string; actions: Record<string, string[]> }
    > = {}

    for (const [key, plugin] of Object.entries(plugins)) {
      const actions = await plugin.actions(project)
      pluginData[key] = {
        name: plugin.name,
        actions,
      }
    }

    if (flags.json) {
      console.log(JSON.stringify(pluginData))
      return { success: true }
    }

    for (const [_key, plugin] of Object.entries(pluginData)) {
      const actionNames = Object.keys(plugin.actions)
      console.log(`${plugin.name}: ${actionNames.length} actions`)
      for (const actionName of actionNames) {
        console.log(
          `  - ${actionName}: ${plugin.actions[actionName].join(' && ')}`,
        )
      }
    }

    return { success: true }
  },
})
