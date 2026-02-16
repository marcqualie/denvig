import { Command } from '../../lib/command.ts'
import { configureGateway } from '../../lib/gateway/configure.ts'

export const gatewayConfigureCommand = new Command({
  name: 'gateway:configure',
  description:
    'Rebuild all nginx configs from service definitions across all projects',
  usage: 'gateway configure',
  example: 'gateway configure',
  args: [],
  flags: [],
  handler: async ({ flags }) => {
    const result = await configureGateway()

    if (!result) {
      console.error(
        'Gateway is not enabled. Add experimental.gateway.enabled: true to ~/.denvig/config.yml',
      )
      return { success: false, message: 'Gateway is not enabled' }
    }

    if (flags.json) {
      console.log(JSON.stringify(result, null, 2))
    } else {
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
