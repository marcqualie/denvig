import { getGlobalConfig } from '../config.ts'
import { DenvigProject } from '../project.ts'
import { listProjects } from '../projects.ts'
import { findCertForDomain, resolveSslPaths } from './certs.ts'
import { writeGatewayHtmlFiles } from './html.ts'
import {
  reloadNginx,
  removeAllNginxConfigs,
  writeNginxConfig,
  writeNginxMainConfig,
} from './nginx.ts'

export type ConfigureServiceResult = {
  projectSlug: string
  serviceName: string
  domain: string
  cnames: string[]
  port: number
  certStatus: 'valid' | 'missing' | 'not_configured'
  certDir?: string
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

  // Write gateway HTML files and nginx.conf
  await writeGatewayHtmlFiles()
  const mainConfigResult = await writeNginxMainConfig(configsPath)
  if (!mainConfigResult.success) {
    return {
      success: false,
      removed: [],
      services: [],
      nginxReload: false,
      message: mainConfigResult.message || 'Failed to write nginx.conf',
    }
  }

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
      const secure = config.http.secure ?? false

      // Resolve SSL paths by finding matching certs
      let sslCertPath: string | undefined
      let sslKeyPath: string | undefined
      let certStatus: ConfigureServiceResult['certStatus'] = 'not_configured'
      let resolvedCertDir: string | undefined
      let certMessage: string | undefined

      if (secure) {
        const certDir = findCertForDomain(domain)
        if (certDir) {
          const sslPaths = resolveSslPaths(certDir)
          if (sslPaths) {
            sslCertPath = sslPaths.sslCertPath
            sslKeyPath = sslPaths.sslKeyPath
            certStatus = 'valid'
            resolvedCertDir = certDir
          } else {
            certStatus = 'missing'
            certMessage = 'cert directory found but files missing'
          }
        } else {
          certStatus = 'missing'
          certMessage = 'no matching certificate found'
        }
      }

      const result: ConfigureServiceResult = {
        projectSlug: project.slug,
        serviceName: name,
        domain,
        cnames,
        port,
        certStatus,
        certDir: resolvedCertDir,
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
          sslCertPath,
          sslKeyPath,
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
