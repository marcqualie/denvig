import { execSync } from 'node:child_process'
import { existsSync } from 'node:fs'

import { Command } from '../../lib/command.ts'
import { getGlobalConfig } from '../../lib/config.ts'
import { findCertForDomain, resolveSslPaths } from '../../lib/gateway/certs.ts'
import {
  getNginxConfigPath,
  getNginxConfPath,
} from '../../lib/gateway/nginx.ts'

type NginxServiceStatus = {
  running: boolean
  pid: number | null
  status: string | null
}

/**
 * Check if nginx is running via `brew services info nginx --json`.
 */
function getNginxServiceStatus(): NginxServiceStatus {
  try {
    const output = execSync('brew services info nginx --json', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    })
    const parsed = JSON.parse(output)
    const info = Array.isArray(parsed) ? parsed[0] : parsed
    return {
      running: info.running ?? false,
      pid: info.pid ?? null,
      status: info.status ?? null,
    }
  } catch {
    return { running: false, pid: null, status: null }
  }
}

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
      const nginxService = getNginxServiceStatus()
      const services = project.config.services || {}
      const serviceStatuses = []

      for (const [name, config] of Object.entries(services)) {
        if (config.http?.domain) {
          const domain = config.http.domain
          const secure = config.http.secure ?? false
          const certDir = secure ? findCertForDomain(domain) : null
          const sslPaths = certDir ? resolveSslPaths(certDir) : null
          const nginxPath = gateway?.enabled
            ? getNginxConfigPath(project.id, name, gateway.configsPath)
            : null

          serviceStatuses.push({
            name,
            domain,
            cnames: config.http.cnames || [],
            port: config.http.port,
            secure,
            certFound: !!sslPaths,
            certDir,
            nginxConfigPath: nginxPath,
            nginxConfigExists: nginxPath ? existsSync(nginxPath) : false,
          })
        }
      }

      console.log(
        JSON.stringify({
          enabled: gateway?.enabled || false,
          handler: gateway?.handler || 'nginx',
          nginx: nginxService,
          nginxConf: gateway?.configsPath
            ? getNginxConfPath(gateway.configsPath)
            : null,
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

    const nginxService = getNginxServiceStatus()
    const statusLabel = nginxService.running
      ? `Started (pid ${nginxService.pid})`
      : 'Stopped'

    console.log(`Status:    ${statusLabel}`)
    console.log(`Handler:   ${gateway.handler || 'nginx'}`)
    console.log(`Config:    ${getNginxConfPath(gateway.configsPath)}`)
    console.log(`Configs:   ${gateway.configsPath}`)
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
      const secure = config.http!.secure ?? false

      const certDir = secure ? findCertForDomain(domain) : null
      const sslPaths = certDir ? resolveSslPaths(certDir) : null
      const nginxPath = getNginxConfigPath(
        project.id,
        name,
        gateway.configsPath,
      )
      const nginxExists = existsSync(nginxPath)

      const certStatus = !secure ? '-' : sslPaths ? '✓' : '✗'
      const certLabel = !secure ? 'not enabled' : sslPaths ? 'found' : 'missing'
      const nginxStatus = nginxExists ? '✓' : '✗'

      console.log(`  ${name}:`)
      console.log(`    Domains: ${allDomains.join(', ')}`)
      console.log(`    Port:    ${config.http!.port || '(not set)'}`)
      console.log(`    Certs:   ${certStatus} ${certLabel}`)
      console.log(
        `    Nginx:   ${nginxStatus} ${nginxExists ? 'configured' : 'not generated'}`,
      )
      console.log('')
    }

    return { success: true, message: 'Gateway status retrieved' }
  },
})
