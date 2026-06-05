import { DenvigValidationError } from '../errors.ts'
import plugins from '../plugins.ts'

import type { Worktree } from '../project/worktree.ts'

/** An action tagged with the source that produced it. */
export type ResolvedAction = {
  name: string
  /** `project` for `.denvig.yml` actions, otherwise the plugin ecosystem. */
  ecosystem: string
  commands: string[]
}

/**
 * Detect a worktree's actions while preserving which source defined each one.
 * Unlike {@link detectActions}, this does not merge sources into a flat map, so
 * an action can be resolved for a specific ecosystem (e.g. `npm:build`).
 *
 * Project-config actions are tagged `project` and listed first; plugin actions
 * follow in plugin order.
 */
export const detectActionsByEcosystem = async (
  worktree: Worktree,
): Promise<ResolvedAction[]> => {
  const resolved: ResolvedAction[] = []

  if (worktree.config.actions) {
    for (const [name, value] of Object.entries(worktree.config.actions)) {
      resolved.push({
        name,
        ecosystem: 'project',
        commands: [(value as { command: string }).command],
      })
    }
  }

  for (const [key, plugin] of Object.entries(plugins)) {
    const pluginActions = await plugin.actions(worktree)
    for (const [name, commands] of Object.entries(pluginActions)) {
      resolved.push({ name, ecosystem: plugin.name ?? key, commands })
    }
  }

  return resolved
}

/**
 * Resolve a single action by name, optionally scoped to an ecosystem. Supports
 * the `ecosystem:name` shorthand (e.g. `npm:build`), which takes precedence over
 * the `ecosystem` argument.
 *
 * Without an ecosystem the commands from every source that defines the action
 * are concatenated (project first), matching the merged behaviour of
 * {@link detectActions}. Throws {@link DenvigValidationError} when nothing
 * matches.
 */
export const resolveAction = (
  resolved: ResolvedAction[],
  name: string,
  ecosystem?: string,
): ResolvedAction => {
  let targetName = name
  let targetEcosystem = ecosystem

  const colon = name.indexOf(':')
  if (colon !== -1) {
    targetEcosystem = name.slice(0, colon)
    targetName = name.slice(colon + 1)
  }

  const matches = resolved.filter((action) => action.name === targetName)
  if (matches.length === 0) {
    throw new DenvigValidationError(`Action "${name}" not found.`)
  }

  if (targetEcosystem) {
    const match = matches.find((action) => action.ecosystem === targetEcosystem)
    if (!match) {
      throw new DenvigValidationError(
        `Action "${targetName}" not found for ecosystem "${targetEcosystem}".`,
      )
    }
    return match
  }

  // No ecosystem: merge every source's commands, preserving project-first order.
  return {
    name: targetName,
    ecosystem: matches[0].ecosystem,
    commands: matches.flatMap((action) => action.commands),
  }
}
