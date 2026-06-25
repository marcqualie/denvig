import { Command } from '../../lib/command.ts'
import { formatGatewayService } from '../../lib/formatters/gateway-service.ts'

export const gatewayStatusCommand = new Command({
  name: 'gateway:status',
  description: 'Show gateway configuration status',
  usage: 'gateway [status]',
  example: 'gateway status',
  args: [],
  flags: [],
  handler: async ({ sdk, flags }) => {
    const status = await sdk.gateway.status()

    if (flags.json) {
      console.log(
        JSON.stringify({
          handler: status.handler,
          nginx: status.nginx,
          nginxConf: status.nginxConf,
          configsPath: status.configsPath,
          services: status.services,
        }),
      )
      return { success: true, message: 'Gateway status retrieved' }
    }

    // Text output
    console.log('')
    console.log('Gateway Status')
    console.log('==============')
    console.log('')

    const statusLabel = status.nginx.running
      ? `Started (pid ${status.nginx.pid})`
      : 'Stopped'

    console.log(`Status:    ${statusLabel}`)
    console.log(`Handler:   ${status.handler}`)
    console.log(`Config:    ${status.nginxConf}`)
    console.log(`Configs:   ${status.configsPath}`)
    console.log('')

    if (status.services.length === 0) {
      console.log('No running services are routed through the gateway')
      console.log('')
      console.log('Start a service with an http.domain to add a route:')
      console.log('')
      console.log('  services:')
      console.log('    my-service:')
      console.log('      command: node server.js')
      console.log('      http:')
      console.log('        port: 3000')
      console.log('        domain: my-service.denvig.localhost')
      console.log('')
      return { success: true, message: 'No gateway services running' }
    }

    console.log('Services:')
    console.log('')

    for (const service of status.services) {
      console.log(
        formatGatewayService({
          projectSlug: service.projectSlug,
          serviceName: service.name,
          domains: [service.domain, ...service.cnames],
          port: service.port,
          certStatus: service.certStatus,
          certDir: service.certDir,
          certMessage: service.certMessage,
          nginxOk: service.nginxConfigExists,
          nginxLabel: service.nginxConfigExists ? 'configured' : 'missing',
        }),
      )
      console.log('')
    }

    return { success: true, message: 'Gateway status retrieved' }
  },
})
