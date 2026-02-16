import { existsSync } from 'node:fs'

import { getGlobalConfig } from '../config.ts'
import { DenvigProject } from '../project.ts'
import { listProjects } from '../projects.ts'
import { resolveCertPath } from './certs.ts'
import {
  reloadNginx,
  removeAllNginxConfigs,
  writeNginxConfig,
} from './nginx.ts'

export type ConfigureServiceResult = {
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

export type ConfigureGatewayResult = {
  success: boolean
  removed: string[]
  services: ConfigureServiceResult[]
  nginxReload: boolean
  nginxReloadMessage?: string
  message?: string
}

/**
 * Remove all denvig nginx configs and rebuild from current service definitions
 * across all projects. Returns null if gateway is not enabled.
 */
export async function configureGateway(): Promise<ConfigureGatewayResult | null> {
  const globalConfig = getGlobalConfig()
  const gateway = globalConfig.experimental?.gateway
  if (!gateway?.enabled) {
    return null
  }

  const configsPath = gateway.configsPath

  // Remove all existing denvig nginx configs
  const removeResult = await removeAllNginxConfigs(configsPath)
  if (!removeResult.success) {
    return {
      success: false,
      removed: [],
      services: [],
      nginxReload: false,
      message: removeResult.message || 'Failed to remove existing configs',
    }
  }

  // Iterate all projects that have a .denvig.yml
  const projects = listProjects({ withConfig: true })
  const services: ConfigureServiceResult[] = []

  for (const projectInfo of projects) {
    const project = new DenvigProject(projectInfo.path)
    const projectServices = project.config.services || {}

    for (const [name, config] of Object.entries(projectServices)) {
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

      let certStatus: ConfigureServiceResult['certStatus'] = 'not_configured'
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

      const result: ConfigureServiceResult = {
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

      services.push(result)
    }
  }

  // Reload nginx
  const reloadResult = await reloadNginx()

  const hasErrors = services.some(
    (r) => r.configStatus === 'error' || r.certStatus === 'missing',
  )

  return {
    success: !hasErrors,
    removed: removeResult.removed,
    services,
    nginxReload: reloadResult.success,
    nginxReloadMessage: reloadResult.message,
    message: hasErrors
      ? 'Some services have errors or missing certificates'
      : 'Gateway configured successfully',
  }
}
