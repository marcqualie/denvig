import type { Actions } from './types'

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
