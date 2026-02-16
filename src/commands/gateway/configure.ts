import { existsSync } from 'node:fs'

import { Command } from '../../lib/command.ts'
import { getGlobalConfig } from '../../lib/config.ts'
import { resolveCertPath } from '../../lib/gateway/certs.ts'
import {
  reloadNginx,
  removeAllNginxConfigs,
  writeNginxConfig,
} from '../../lib/gateway/nginx.ts'
import { DenvigProject } from '../../lib/project.ts'
import { listProjects } from '../../lib/projects.ts'

type ConfigureResult = {
  projectSlug: string
  serviceName: string
  domain: string
  cnames: string[]
  port: number
  certStatus: 'valid' | 'missing' | 'not_configured'
  certMessage?: string
  configStatus: 'written' | 'error'
  configMessage?: string
}

export const gatewayConfigureCommand = new Command({
  name: 'gateway:configure',
  description:
    'Rebuild all nginx configs from service definitions across all projects',
  usage: 'gateway configure',
  example: 'gateway configure',
  args: [],
  flags: [],
  handler: async ({ flags }) => {
    const globalConfig = getGlobalConfig()
    const gateway = globalConfig.experimental?.gateway

    if (!gateway?.enabled) {
      console.error(
        'Gateway is not enabled. Add experimental.gateway.enabled: true to ~/.denvig/config.yml',
      )
      return { success: false, message: 'Gateway is not enabled' }
    }

    const configsPath = gateway.configsPath

    // Remove all existing denvig nginx configs across all projects
    const removeResult = await removeAllNginxConfigs(configsPath)
    if (!removeResult.success) {
      console.error(removeResult.message)
      return {
        success: false,
        message: removeResult.message || 'Failed to remove existing configs',
      }
    }

    // Iterate all projects that have a .denvig.yml
    const projects = listProjects({ withConfig: true })
    const results: ConfigureResult[] = []

    for (const projectInfo of projects) {
      const project = new DenvigProject(projectInfo.path)
      const services = project.config.services || {}

      for (const [name, config] of Object.entries(services)) {
        if (!config.http?.domain || !config.http?.port) {
          continue
        }

        const domain = config.http.domain
        const cnames = config.http.cnames || []
        const port = config.http.port

        // Verify certificates exist if configured
        const certPath = resolveCertPath(
          config.http.certPath,
          domain,
          project.path,
          'cert',
        )
        const keyPath = resolveCertPath(
          config.http.keyPath,
          domain,
          project.path,
          'key',
        )

        let certStatus: ConfigureResult['certStatus'] = 'not_configured'
        let certMessage: string | undefined

        if (certPath && keyPath) {
          const certExists = existsSync(certPath)
          const keyExists = existsSync(keyPath)
          if (certExists && keyExists) {
            certStatus = 'valid'
          } else {
            certStatus = 'missing'
            const missing = []
            if (!certExists) missing.push('cert')
            if (!keyExists) missing.push('key')
            certMessage = `${missing.join(' and ')} not found`
          }
        }

        const result: ConfigureResult = {
          projectSlug: project.slug,
          serviceName: name,
          domain,
          cnames,
          port,
          certStatus,
          certMessage,
          configStatus: 'written',
        }

        // Write nginx config
        const writeResult = await writeNginxConfig(
          {
            projectId: project.id,
            projectPath: project.path,
            projectSlug: project.slug,
            serviceName: name,
            port,
            domain,
            cnames,
            secure: config.http.secure,
            certPath: config.http.certPath,
            keyPath: config.http.keyPath,
          },
          configsPath,
        )

        if (!writeResult.success) {
          result.configStatus = 'error'
          result.configMessage = writeResult.message
        }

        results.push(result)
      }
    }

    // Reload nginx
    const reloadResult = await reloadNginx()

    if (flags.json) {
      console.log(
        JSON.stringify(
          {
            removed: removeResult.removed,
            services: results,
            nginxReload: reloadResult.success,
            nginxReloadMessage: reloadResult.message,
          },
          null,
          2,
        ),
      )
    } else {
      console.log('')

      if (removeResult.removed.length > 0) {
        console.log(
          `Removed ${removeResult.removed.length} existing config${removeResult.removed.length === 1 ? '' : 's'}`,
        )
        console.log('')
      }

      if (results.length === 0) {
        console.log('No services with http.domain and http.port configured.')
      } else {
        console.log('Gateway Configuration:')
        console.log('')

        for (const result of results) {
          const certIcon = result.certStatus === 'valid' ? '✓' : '✗'
          const configIcon = result.configStatus === 'written' ? '✓' : '✗'
          const cnamesInfo =
            result.cnames.length > 0
              ? ` + ${result.cnames.length} cname${result.cnames.length > 1 ? 's' : ''}`
              : ''

          console.log(`  ${result.projectSlug}/${result.serviceName}:`)
          console.log(
            `    Domain: ${result.domain}${cnamesInfo} -> localhost:${result.port}`,
          )
          console.log(
            `    Certs:  ${certIcon} ${result.certStatus}${result.certMessage ? ` (${result.certMessage})` : ''}`,
          )
          console.log(
            `    Nginx:  ${configIcon} ${result.configStatus}${result.configMessage ? ` (${result.configMessage})` : ''}`,
          )
          console.log('')
        }
      }

      if (reloadResult.success) {
        console.log('Nginx reloaded successfully')
      } else {
        console.log(`Nginx reload failed: ${reloadResult.message}`)
      }
      console.log('')
    }

    const hasErrors = results.some(
      (r) => r.configStatus === 'error' || r.certStatus === 'missing',
    )
    return {
      success: !hasErrors,
      message: hasErrors
        ? 'Some services have errors or missing certificates'
        : 'Gateway configured successfully',
    }
  },
})
