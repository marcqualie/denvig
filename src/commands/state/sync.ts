import { Command } from '../../lib/command.ts'
import { configureGateway } from '../../lib/gateway/configure.ts'
import { reconcileServices } from '../../lib/services/reconcile.ts'

export const stateSyncCommand = new Command({
  name: 'state:sync',
  description:
    'Reconcile launchctl with ~/.denvig/state.json and rebuild gateway configs',
  usage: 'state sync',
  example: 'denvig state sync',
  args: [],
  flags: [],
  handler: async ({ flags }) => {
    const reconcileResult = await reconcileServices()
    const gatewayResult = await configureGateway()

    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            reconcile: reconcileResult,
            gateway: gatewayResult,
          },
          null,
          2,
        ),
      )
      return { success: reconcileResult.errors.length === 0 }
    }

    if (reconcileResult.actions.length === 0) {
      console.log('No reconciliation actions needed.')
    } else {
      for (const action of reconcileResult.actions) {
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
    }

    for (const err of reconcileResult.errors) {
      console.error(`✗ ${err.project}/${err.service}: ${err.message}`)
    }

    if (gatewayResult) {
      console.log('')
      console.log(
        gatewayResult.nginxReload
          ? `Gateway: ${gatewayResult.services.length} route(s) configured, nginx reloaded`
          : `Gateway: ${gatewayResult.services.length} route(s) configured, nginx reload failed (${gatewayResult.nginxReloadMessage})`,
      )
    }

    return {
      success: reconcileResult.errors.length === 0,
      message: 'State sync complete',
    }
  },
})
