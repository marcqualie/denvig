import { Command } from '../lib/command.ts'

export const pluginsCommand = new Command({
  name: 'plugins',
  description: 'Show a list of available plugins and their actions',
  usage: 'plugins',
  example: 'denvig plugins',
  args: [],
  flags: [],
  handler: async ({ project, flags }) => {
    const pluginData = await project.plugins()

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
