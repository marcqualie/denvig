import plugins from '../plugins.ts'
import { mergeActions } from './mergeActions.ts'

import type { DenvigProject } from '../project.ts'
import type { Actions } from './types.ts'

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
