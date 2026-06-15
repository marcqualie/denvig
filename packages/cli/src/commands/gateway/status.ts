import { Command } from '../../lib/command.ts'

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
      console.log('No services configured with http.domain')
      console.log('')
      console.log('To configure a service for gateway, add http.domain:')
      console.log('')
      console.log('  services:')
      console.log('    my-service:')
      console.log('      command: node server.js')
      console.log('      http:')
      console.log('        port: 3000')
      console.log('        domain: my-service.denvig.localhost')
      console.log('')
      return { success: true, message: 'No gateway services configured' }
    }

    console.log('Services:')
    console.log('')

    for (const service of status.services) {
      const allDomains = [service.domain, ...service.cnames]
      const certStatus = !service.secure ? '-' : service.certFound ? '✓' : '✗'
      const certLabel = !service.secure
        ? 'not enabled'
        : service.certFound
          ? 'found'
          : 'missing'
      const nginxStatus = service.nginxConfigExists ? '✓' : '✗'

      console.log(`  ${service.name}:`)
      console.log(`    Domains: ${allDomains.join(', ')}`)
      console.log(`    Port:    ${service.port || '(not set)'}`)
      console.log(`    Certs:   ${certStatus} ${certLabel}`)
      console.log(
        `    Nginx:   ${nginxStatus} ${service.nginxConfigExists ? 'configured' : 'not generated'}`,
      )
      console.log('')
    }

    return { success: true, message: 'Gateway status retrieved' }
  },
})
