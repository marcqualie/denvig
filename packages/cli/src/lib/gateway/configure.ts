import { getGlobalConfig } from '../config.ts'
import { DenvigProject } from '../project.ts'
import { listProjects } from '../projects.ts'
import { createGlobalProject } from '../services/global.ts'
import { readState } from '../services/state.ts'
import { writeGatewayHtmlFiles } from './html.ts'
import {
  reloadNginx,
  removeAllNginxConfigs,
  writeNginxConfig,
  writeNginxMainConfig,
} from './nginx.ts'

import type { Cert } from '../services/state.ts'

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

type RouteGroup = {
  projectId: string
  serviceName: string
  port: number
  secure: boolean
  /** Order: first entry is the primary domain, the rest are cnames. */
  domains: string[]
  /** Key into `state.certs` shared by all routes in this group, if any. */
  certKey?: string
}

/**
 * Remove all denvig nginx configs and rebuild from the runtime gateway
 * routes recorded in `~/.denvig/state.json`. Returns null if gateway is
 * not enabled.
 *
 * The state's `gatewayRoutes` map is the source of truth: each running
 * route generates an nginx server block that proxies the domain to the
 * service's allocated port. Routes for the same `(project, service)`
 * pair are merged into a single nginx config so cnames sit alongside
 * the primary domain in the same `server_name` directive.
 */
export async function configureGateway(): Promise<ConfigureGatewayResult | null> {
  const globalConfig = await getGlobalConfig()
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

  // Resolve project metadata (slug + path) by ID. The route only stores
  // the project ID, but the nginx template wants the slug and absolute
  // path for comments and the document root.
  const projects = await listProjects({ withConfig: true })
  const projectsById = new Map<string, { slug: string; path: string }>()
  await Promise.all(
    projects.map(async (info) => {
      const project = await DenvigProject.retrieve(info.path)
      // Routes are keyed by the checkout's id, so map every worktree (the
      // primary and each detached worktree) back to its slug and path.
      for (const worktree of project.worktrees) {
        projectsById.set(worktree.id, {
          slug: worktree.slug,
          path: worktree.path,
        })
      }
    }),
  )
  const globalProject = await createGlobalProject()
  projectsById.set(globalProject.id, {
    slug: globalProject.slug,
    path: globalProject.path,
  })

  // Group routes by (projectId, serviceName) so cnames stay co-located.
  const state = await readState()
  const groups = new Map<string, RouteGroup>()
  for (const [domain, route] of Object.entries(state.gatewayRoutes)) {
    if (route.desiredStatus !== 'running') continue
    const key = `${route.project}.${route.service}`
    const existing = groups.get(key)
    if (existing) {
      existing.domains.push(domain)
      // Routes inside a group should all reference the same cert, but
      // tolerate one missing the key by preferring whichever does carry one.
      if (!existing.certKey && route.cert) existing.certKey = route.cert
    } else {
      groups.set(key, {
        projectId: route.project,
        serviceName: route.service,
        port: route.port,
        secure: route.secure,
        domains: [domain],
        certKey: route.cert,
      })
    }
  }

  const services: ConfigureServiceResult[] = []
  for (const group of groups.values()) {
    const projectMeta = projectsById.get(group.projectId)
    if (!projectMeta) continue

    const [primary, ...cnames] = group.domains
    const secure = group.secure

    let sslCertPath: string | undefined
    let sslKeyPath: string | undefined
    let certStatus: ConfigureServiceResult['certStatus'] = 'not_configured'
    let resolvedCertDir: string | undefined
    let certMessage: string | undefined

    if (secure) {
      const cert: Cert | undefined = group.certKey
        ? state.certs[group.certKey]
        : undefined
      if (cert) {
        sslCertPath = cert.certPath
        sslKeyPath = cert.keyPath
        certStatus = 'valid'
        resolvedCertDir = cert.dir
      } else {
        certStatus = 'missing'
        certMessage = group.certKey
          ? `cert "${group.certKey}" referenced by route is not in state.certs`
          : 'route has no cert reference; restart the service to refresh state.certs'
      }
    }

    const result: ConfigureServiceResult = {
      projectSlug: projectMeta.slug,
      serviceName: group.serviceName,
      domain: primary,
      cnames,
      port: group.port,
      certStatus,
      certDir: resolvedCertDir,
      certMessage,
      configStatus: 'written',
    }

    const writeResult = await writeNginxConfig(
      {
        projectId: group.projectId,
        projectPath: projectMeta.path,
        projectSlug: projectMeta.slug,
        serviceName: group.serviceName,
        port: group.port,
        domain: primary,
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
