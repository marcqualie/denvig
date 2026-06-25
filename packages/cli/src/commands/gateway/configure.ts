import { Command } from '../../lib/command.ts'
import { formatGatewayService } from '../../lib/formatters/gateway-service.ts'

export const gatewayConfigureCommand = new Command({
  name: 'gateway:configure',
  description:
    'Reconcile launchctl with ~/.denvig/state.json and rebuild all nginx configs',
  usage: 'gateway configure',
  example: 'gateway configure',
  args: [],
  flags: [],
  handler: async ({ sdk, flags }) => {
    const { reconcile: reconcileResult, gateway: result } =
      await sdk.gateway.configure()

    if (flags.json) {
      console.log(
        JSON.stringify(
          { reconcile: reconcileResult, gateway: result },
          null,
          2,
        ),
      )
    } else {
      if (reconcileResult.actions.length > 0) {
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
          if (
            action.type === 'restarted' &&
            action.diff &&
            action.diff.length > 0
          ) {
            for (const line of action.diff) {
              console.log(`    ${line}`)
            }
          }
        }
        console.log('')
      }
      for (const err of reconcileResult.errors) {
        console.error(
          `reconcile: ${err.project}/${err.service}: ${err.message}`,
        )
      }
      console.log('')

      if (result.removed.length > 0) {
        console.log(
          `Removed ${result.removed.length} existing config${result.removed.length === 1 ? '' : 's'}`,
        )
        console.log('')
      }

      if (result.services.length === 0) {
        console.log('No running services are routed through the gateway')
      } else {
        console.log('Services:')
        console.log('')

        for (const service of result.services) {
          console.log(
            formatGatewayService({
              projectSlug: service.projectSlug,
              serviceName: service.serviceName,
              domains: [service.domain, ...service.cnames],
              port: service.port,
              certStatus: service.certStatus,
              certDir: service.certDir,
              certMessage: service.certMessage,
              nginxOk: service.configStatus === 'written',
              nginxLabel:
                service.configStatus === 'written' ? 'configured' : 'error',
              nginxMessage: service.configMessage,
            }),
          )
          console.log('')
        }
      }

      if (result.nginxReload) {
        console.log('Nginx reloaded successfully')
      } else {
        console.log(`Nginx reload failed: ${result.nginxReloadMessage}`)
      }
      console.log('')
    }

    return {
      success: result.success,
      message: result.message,
    }
  },
})
