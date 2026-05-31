import { Command } from '../../lib/command.ts'
import { configureGateway } from '../../lib/gateway/configure.ts'
import { reconcileServices } from '../../lib/services/reconcile.ts'

export const gatewayConfigureCommand = new Command({
  name: 'gateway:configure',
  description:
    'Reconcile launchctl with ~/.denvig/state.json and rebuild all nginx configs',
  usage: 'gateway configure',
  example: 'gateway configure',
  args: [],
  flags: [],
  handler: async ({ flags }) => {
    const reconcileResult = await reconcileServices()
    const result = await configureGateway()

    if (!result) {
      console.error(
        'Gateway is not enabled. Add experimental.gateway.enabled: true to ~/.denvig/config.yml',
      )
      return { success: false, message: 'Gateway is not enabled' }
    }

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
        console.log('No services with http.domain and http.port configured.')
      } else {
        console.log('Gateway Configuration:')
        console.log('')

        for (const service of result.services) {
          const certIcon = service.certStatus === 'valid' ? '✓' : '✗'
          const configIcon = service.configStatus === 'written' ? '✓' : '✗'
          const cnamesInfo =
            service.cnames.length > 0
              ? ` + ${service.cnames.length} cname${service.cnames.length > 1 ? 's' : ''}`
              : ''

          console.log(`  ${service.projectSlug}/${service.serviceName}:`)
          console.log(
            `    Domain: ${service.domain}${cnamesInfo} -> localhost:${service.port}`,
          )
          const certDetail = service.certDir
            ? ` (${service.certDir.split('/').pop()})`
            : service.certMessage
              ? ` (${service.certMessage})`
              : ''
          console.log(
            `    Certs:  ${certIcon} ${service.certStatus}${certDetail}`,
          )
          console.log(
            `    Nginx:  ${configIcon} ${service.configStatus}${service.configMessage ? ` (${service.configMessage})` : ''}`,
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
