import { Command } from '../lib/command.ts'
import plugins from '../lib/plugins.ts'

export const pluginsCommand = new Command({
  name: 'version',
  description: 'Show the current version of Denvig',
  usage: 'version',
  example: 'denvig version',
  args: [],
  flags: [],
  handler: async ({ project }) => {
    for (const [_key, plugin] of Object.entries(plugins)) {
      const actions = await plugin.actions(project)
      const actionNames = Object.keys(actions)
      console.log(`${plugin.name}: ${actionNames.length} actions`)
      for (const actionName of actionNames) {
        console.log(`  - ${actionName}: ${actions[actionName].join(' && ')}`)
      }
    }

    return { success: true }
  },
})
