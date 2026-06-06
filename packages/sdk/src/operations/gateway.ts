import { execSync } from 'node:child_process'

import { getGlobalConfig } from '../lib/config.ts'
import { resolveProjectContext } from '../lib/context.ts'
import { findCertForDomain, resolveSslPaths } from '../lib/gateway/certs.ts'
import {
  type ConfigureGatewayResult,
  configureGateway,
} from '../lib/gateway/configure.ts'
import { getNginxConfigPath, getNginxConfPath } from '../lib/gateway/nginx.ts'
import { pathExists } from '../lib/safeReadFile.ts'
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

/** Gateway status for a single service with an `http.domain`. */
export type GatewayServiceStatus = {
  name: string
  domain: string
  cnames: string[]
  port: number | undefined
  secure: boolean
  /** Whether usable SSL key/cert files were resolved for the domain. */
  certFound: boolean
  /** The certificate directory backing the domain, if any. */
  certDir: string | null
  /** The nginx config path for this service, or `null` when gateway is off. */
  nginxConfigPath: string | null
  nginxConfigExists: boolean
}

export type GatewayStatus = {
  /** Whether the experimental gateway is enabled in the global config. */
  enabled: boolean
  /** The gateway handler (currently always `nginx`). */
  handler: string
  /** Directory nginx server configs are written to. */
  configsPath: string | null
  /** Path of the generated nginx include file. */
  nginxConf: string | null
  /** The nginx process state. */
  nginx: NginxProcessStatus
  /** Gateway-configured services for the resolved project. */
  services: GatewayServiceStatus[]
}

export type GatewayStatusOptions = {
  /** Working directory used to resolve the project whose services are listed. */
  cwd?: string
}

/**
 * Report the gateway's global state (enabled flag, nginx process, paths) plus
 * the gateway-configured services of the project resolved from `cwd`. This is
 * the shared data path behind `denvig gateway status` and `sdk.gateway.status()`.
 */
export const getGatewayStatus = async (
  options: GatewayStatusOptions = {},
): Promise<GatewayStatus> => {
  const globalConfig = await getGlobalConfig()
  const gateway = globalConfig.experimental?.gateway
  const enabled = gateway?.enabled ?? false

  const services: GatewayServiceStatus[] = []
  const { project } = await resolveProjectContext({
    cwd: options.cwd ?? process.cwd(),
  })

  if (project) {
    const worktree = project.activeWorktree
    const configured = worktree.config.services || {}
    for (const [name, config] of Object.entries(configured)) {
      const domain = config.http?.domain
      if (!domain) continue

      const secure = config.http?.secure ?? false
      const certDir = secure ? await findCertForDomain(domain) : null
      const sslPaths = certDir ? await resolveSslPaths(certDir) : null
      const nginxConfigPath = gateway?.enabled
        ? getNginxConfigPath(worktree.id, name, gateway.configsPath)
        : null

      services.push({
        name,
        domain,
        cnames: config.http?.cnames || [],
        port: config.http?.port,
        secure,
        certFound: !!sslPaths,
        certDir,
        nginxConfigPath,
        nginxConfigExists: nginxConfigPath
          ? await pathExists(nginxConfigPath)
          : false,
      })
    }
  }

  return {
    enabled,
    handler: gateway?.handler ?? 'nginx',
    configsPath: gateway?.configsPath ?? null,
    nginxConf: gateway?.configsPath
      ? getNginxConfPath(gateway.configsPath)
      : null,
    nginx: getNginxProcessStatus(),
    services,
  }
}

export type ConfigureGatewayOutput = {
  reconcile: ReconcileResult
  /** The gateway rebuild result, or `null` when the gateway is not enabled. */
  gateway: ConfigureGatewayResult | null
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
