import { getGlobalConfig } from '../config.ts'
import { getServiceStableLogPath } from '../services/paths.ts'
import { writeGatewayHtmlFiles } from './html.ts'
import {
  type NginxConfigOptions,
  reloadNginx,
  removeAllNginxConfigs,
  writeDenvigNginxConfig,
  writeNginxMainConfig,
} from './nginx.ts'
import { resolveGatewayServices } from './routes.ts'

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
 * Remove all denvig nginx configs and rebuild from the runtime gateway
 * routes recorded in `~/.denvig/state.json`.
 *
 * The state's `gatewayRoutes` map is the source of truth (resolved via
 * `resolveGatewayServices`): each running route generates an nginx server
 * block that proxies the domain to the service's allocated port. Routes for
 * the same `(project, service)` pair are merged into a single nginx config so
 * cnames sit alongside the primary domain in the same `server_name` directive.
 */
export async function configureGateway(): Promise<ConfigureGatewayResult> {
  const globalConfig = await getGlobalConfig()
  const configsPath = globalConfig.gateway.configsPath

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

  // state.json is the single source of truth — the same resolved routes that
  // `gateway status` reports are rendered into nginx here.
  const routes = await resolveGatewayServices()

  const services: ConfigureServiceResult[] = []
  const serverConfigs: NginxConfigOptions[] = []
  for (const route of routes) {
    services.push({
      projectSlug: route.projectSlug,
      serviceName: route.serviceName,
      domain: route.domain,
      cnames: route.cnames,
      port: route.port,
      certStatus: route.certStatus,
      certDir: route.certDir,
      certMessage: route.certMessage,
      configStatus: 'written',
    })

    serverConfigs.push({
      projectId: route.projectId,
      projectPath: route.projectPath,
      projectSlug: route.projectSlug,
      serviceName: route.serviceName,
      port: route.port,
      domain: route.domain,
      cnames: route.cnames,
      sslCertPath: route.sslCertPath,
      sslKeyPath: route.sslKeyPath,
      logPath: getServiceStableLogPath(route.projectId, route.serviceName),
    })
  }

  // Write every server block into the single combined denvig nginx config.
  const writeResult = await writeDenvigNginxConfig(serverConfigs)
  if (!writeResult.success) {
    for (const result of services) {
      result.configStatus = 'error'
      result.configMessage = writeResult.message
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
