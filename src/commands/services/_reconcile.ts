import { reconcileServices } from '../../lib/services/reconcile.ts'

/**
 * Run the state.json → launchctl reconciler after a `services` command
 * mutated state. Errors are surfaced to stderr so they don't break the
 * command's own JSON/output contract, but a hard failure is not fatal —
 * the user can re-run `denvig gateway configure` to retry.
 */
export const reconcileAfterCommand = async (options: {
  json?: boolean
}): Promise<void> => {
  try {
    const result = await reconcileServices()
    if (options.json) return

    const meaningful = result.actions.filter((a) => a.type !== 'skipped')
    for (const action of meaningful) {
      const icon =
        action.type === 'started'
          ? '▶'
          : action.type === 'stopped'
            ? '■'
            : action.type === 'restarted'
              ? '↻'
              : '·'
      console.log(
        `${icon} ${action.type} ${action.project}/${action.service} — ${action.reason}`,
      )
    }
    for (const err of result.errors) {
      console.error(`reconcile: ${err.project}/${err.service}: ${err.message}`)
    }
  } catch (e) {
    if (options.json) return
    console.error(
      `reconcile failed: ${e instanceof Error ? e.message : String(e)}`,
    )
  }
}
