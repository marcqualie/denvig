import { execSync } from 'node:child_process'

import { getGlobalConfig } from '../lib/config.ts'
import {
  type ConfigureGatewayResult,
  configureGateway,
} from '../lib/gateway/configure.ts'
import {
  getDenvigNginxConfPath,
  getNginxConfPath,
} from '../lib/gateway/nginx.ts'
import { resolveGatewayServices } from '../lib/gateway/routes.ts'
import { safeReadTextFile } from '../lib/safeReadFile.ts'
import {
  type ReconcileResult,
  reconcileServices,
} from '../lib/services/reconcile.ts'

/** The nginx process state as reported by `brew services`. */
export type NginxProcessStatus = {
  running: boolean
  pid: number | null
  status: string | null
}

const getNginxProcessStatus = (): NginxProcessStatus => {
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

/** Gateway status for a single running route, as recorded in state.json. */
export type GatewayServiceStatus = {
  name: string
  /** Slug of the project (checkout) that owns the route. */
  projectSlug: string
  domain: string
  cnames: string[]
  port: number
  secure: boolean
  /** Cert resolution for a secure route; `not_configured` when not secure. */
  certStatus: 'valid' | 'missing' | 'not_configured'
  /** The certificate directory backing the domain, if any. */
  certDir: string | null
  /** Explanation when `certStatus` is `missing`. */
  certMessage?: string
  /** The nginx config path for this service. */
  nginxConfigPath: string
  nginxConfigExists: boolean
}

export type GatewayStatus = {
  /** The gateway handler (currently always `nginx`). */
  handler: string
  /** Directory nginx server configs are written to. */
  configsPath: string
  /** Path of the generated nginx include file. */
  nginxConf: string
  /** The nginx process state. */
  nginx: NginxProcessStatus
  /** Every running gateway service recorded in state.json. */
  services: GatewayServiceStatus[]
}

/**
 * Report the gateway's global state (handler, nginx process, paths) plus every
 * running gateway service recorded in `~/.denvig/state.json`. This reads the
 * same resolved routes that `gateway configure` renders into nginx, so the two
 * commands always describe the identical set of services.
 */
export const getGatewayStatus = async (): Promise<GatewayStatus> => {
  const globalConfig = await getGlobalConfig()
  const gateway = globalConfig.gateway

  // Every service shares the single combined denvig config; read it once and
  // detect a service's presence by its upstream block.
  const nginxConfigPath = getDenvigNginxConfPath()
  const nginxConfigContent = await safeReadTextFile(nginxConfigPath)

  const routes = await resolveGatewayServices()
  const services: GatewayServiceStatus[] = routes.map((route) => {
    const upstreamName = `denvig-${route.projectId}--${route.serviceName}`
    return {
      name: route.serviceName,
      projectSlug: route.projectSlug,
      domain: route.domain,
      cnames: route.cnames,
      port: route.port,
      secure: route.secure,
      certStatus: route.certStatus,
      certDir: route.certDir ?? null,
      certMessage: route.certMessage,
      nginxConfigPath,
      nginxConfigExists: nginxConfigContent?.includes(upstreamName) ?? false,
    }
  })

  return {
    handler: gateway.handler,
    configsPath: gateway.configsPath,
    nginxConf: getNginxConfPath(gateway.configsPath),
    nginx: getNginxProcessStatus(),
    services,
  }
}

export type ConfigureGatewayOutput = {
  reconcile: ReconcileResult
  /** The gateway rebuild result. */
  gateway: ConfigureGatewayResult
}

/**
 * Reconcile launchctl with the recorded state, then rebuild every nginx config
 * from the runtime gateway routes. Shared by `denvig gateway configure` and
 * `sdk.gateway.configure()`.
 */
export const configureGatewayAll =
  async (): Promise<ConfigureGatewayOutput> => {
    const reconcile = await reconcileServices()
    const gateway = await configureGateway()
    return { reconcile, gateway }
  }
