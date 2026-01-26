import { existsSync } from 'node:fs'

import { Command } from '../../lib/command.ts'
import { getGlobalConfig } from '../../lib/config.ts'
import { resolveCertPath } from '../../lib/gateway/certs.ts'
import { getNginxConfigPath } from '../../lib/gateway/nginx.ts'

export const gatewayStatusCommand = new Command({
  name: 'gateway:status',
  description: 'Show gateway configuration status',
  usage: 'gateway [status]',
  example: 'gateway status',
  args: [],
  flags: [],
  handler: async ({ project, flags }) => {
    const globalConfig = getGlobalConfig()
    const gateway = globalConfig.experimental?.gateway

    if (flags.json) {
      const services = project.config.services || {}
      const serviceStatuses = []

      for (const [name, config] of Object.entries(services)) {
        if (config.http?.domain) {
          const certPath = resolveCertPath(
            config.http.certPath,
            config.http.domain,
            project.path,
            'cert',
          )
          const keyPath = resolveCertPath(
            config.http.keyPath,
            config.http.domain,
            project.path,
            'key',
          )
          const nginxPath = gateway?.enabled
            ? getNginxConfigPath(project.id, name, gateway.configsPath)
            : null

          serviceStatuses.push({
            name,
            domain: config.http.domain,
            cnames: config.http.cnames || [],
            port: config.http.port,
            secure: config.http.secure || false,
            certPath,
            keyPath,
            certExists: certPath ? existsSync(certPath) : false,
            keyExists: keyPath ? existsSync(keyPath) : false,
            nginxConfigPath: nginxPath,
            nginxConfigExists: nginxPath ? existsSync(nginxPath) : false,
          })
        }
      }

      console.log(
        JSON.stringify({
          enabled: gateway?.enabled || false,
          handler: gateway?.handler || 'nginx',
          configsPath: gateway?.configsPath || null,
          services: serviceStatuses,
        }),
      )
      return { success: true, message: 'Gateway status retrieved' }
    }

    // Text output
    console.log('')
    console.log('Gateway Status')
    console.log('==============')
    console.log('')

    if (!gateway?.enabled) {
      console.log('Status:  Disabled')
      console.log('')
      console.log('To enable gateway, add to ~/.denvig/config.yml:')
      console.log('')
      console.log('  experimental:')
      console.log('    gateway:')
      console.log('      enabled: true')
      console.log('')
      return { success: true, message: 'Gateway is disabled' }
    }

    console.log('Status:  Enabled')
    console.log(`Handler: ${gateway.handler || 'nginx'}`)
    console.log(`Configs: ${gateway.configsPath}`)
    console.log('')

    // Show services with gateway config
    const services = project.config.services || {}
    const gatewayServices = Object.entries(services).filter(
      ([, config]) => config.http?.domain,
    )

    if (gatewayServices.length === 0) {
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

    for (const [name, config] of gatewayServices) {
      const domain = config.http!.domain!
      const cnames = config.http!.cnames || []
      const allDomains = [domain, ...cnames]

      const certPath = resolveCertPath(
        config.http!.certPath,
        domain,
        project.path,
        'cert',
      )
      const keyPath = resolveCertPath(
        config.http!.keyPath,
        domain,
        project.path,
        'key',
      )
      const nginxPath = getNginxConfigPath(
        project.id,
        name,
        gateway.configsPath,
      )

      const certExists = certPath && existsSync(certPath)
      const keyExists = keyPath && existsSync(keyPath)
      const nginxExists = existsSync(nginxPath)

      const certStatus = certExists && keyExists ? '✓' : '✗'
      const nginxStatus = nginxExists ? '✓' : '✗'

      console.log(`  ${name}:`)
      console.log(`    Domains: ${allDomains.join(', ')}`)
      console.log(`    Port:    ${config.http!.port || '(not set)'}`)
      console.log(
        `    Certs:   ${certStatus} ${certExists ? 'configured' : 'missing'}`,
      )
      console.log(
        `    Nginx:   ${nginxStatus} ${nginxExists ? 'configured' : 'not generated'}`,
      )
      console.log('')
    }

    return { success: true, message: 'Gateway status retrieved' }
  },
})
