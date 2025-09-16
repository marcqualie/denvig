import plugins from './plugins.ts'

import type { DenvigProject } from './project.ts'

type Actions = Record<string, string[]>

/**
 * Return the actions from combined sources.
 *
 * Actions are built in order of priority, highest first:
 * - Project defined actions
 * - Globally defined actions (TODO)
 * - deno.json tasks
 * - package.json scripts
 */
export const detectActions = async (
  project: DenvigProject,
): Promise<Actions> => {
  let actions: Actions = {}

  // Project
  if (project.config.actions) {
    actions = {
      ...Object.entries(project.config.actions).reduce((acc, [key, value]) => {
        acc[key] = [(value as { command: string }).command]
        return acc
      }, {} as Actions),
    }
  }

  // Plugins
  for (const [_key, plugin] of Object.entries(plugins)) {
    const pluginActions = await plugin.actions(project)
    actions = mergeActions(actions, pluginActions)
  }

  return actions
}

/**
 * Combine two actions maps. Existing actions should not be overwritten.
 */
export const mergeActions = (
  actions: Actions,
  newActions: Actions,
): Actions => {
  for (const [key, value] of Object.entries(newActions)) {
    if (!actions[key]) {
      actions[key] = []
    }
    actions[key].push(...value)
  }
  return actions
}
