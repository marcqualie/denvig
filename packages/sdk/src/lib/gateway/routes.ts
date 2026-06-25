import { resolveProjectCheckouts } from '../projects.ts'
import { createGlobalProject } from '../services/global.ts'
import { readState } from '../services/state.ts'

import type { Cert } from '../services/state.ts'

/**
 * A running gateway route resolved from `~/.denvig/state.json`, with the
 * project metadata and cert it references already looked up. This is the
 * single source of truth shared by `gateway status` and `gateway configure`
 * so both commands describe exactly the same set of services.
 */
export type GatewayServiceRoute = {
  projectId: string
  projectSlug: string
  projectPath: string
  serviceName: string
  port: number
  secure: boolean
  /** Primary domain (first claimed); cnames follow in `cnames`. */
  domain: string
  cnames: string[]
  certStatus: 'valid' | 'missing' | 'not_configured'
  sslCertPath?: string
  sslKeyPath?: string
  certDir?: string
  certMessage?: string
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
 * Resolve every running gateway route into a fully-described service.
 *
 * Routes for the same `(project, service)` pair are merged so cnames sit
 * alongside the primary domain. The project id recorded on each route is
 * mapped back to its checkout (slug + path); routes whose project checkout no
 * longer exists are orphaned and dropped. Secure routes resolve their cert
 * from `state.certs`. Results are sorted by primary domain for stable output.
 */
export async function resolveGatewayServices(): Promise<GatewayServiceRoute[]> {
  // The route only stores a project id; resolve it to the checkout's slug and
  // path. The global project isn't in this map, so add it explicitly.
  const projectsById = await resolveProjectCheckouts()
  const globalProject = await createGlobalProject()
  projectsById.set(globalProject.id, {
    slug: globalProject.slug,
    path: globalProject.path,
  })

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

  const resolved: GatewayServiceRoute[] = []
  for (const group of groups.values()) {
    const projectMeta = projectsById.get(group.projectId)
    if (!projectMeta) continue

    const [primary, ...cnames] = group.domains

    let sslCertPath: string | undefined
    let sslKeyPath: string | undefined
    let certDir: string | undefined
    let certMessage: string | undefined
    let certStatus: GatewayServiceRoute['certStatus'] = 'not_configured'

    if (group.secure) {
      const cert: Cert | undefined = group.certKey
        ? state.certs[group.certKey]
        : undefined
      if (cert) {
        sslCertPath = cert.certPath
        sslKeyPath = cert.keyPath
        certDir = cert.dir
        certStatus = 'valid'
      } else {
        certStatus = 'missing'
        certMessage = group.certKey
          ? `cert "${group.certKey}" referenced by route is not in state.certs`
          : 'route has no cert reference; restart the service to refresh state.certs'
      }
    }

    resolved.push({
      projectId: group.projectId,
      projectSlug: projectMeta.slug,
      projectPath: projectMeta.path,
      serviceName: group.serviceName,
      port: group.port,
      secure: group.secure,
      domain: primary,
      cnames,
      certStatus,
      sslCertPath,
      sslKeyPath,
      certDir,
      certMessage,
    })
  }

  resolved.sort((a, b) => a.domain.localeCompare(b.domain))
  return resolved
}
