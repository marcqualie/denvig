import { confirm } from '../../lib/input.ts'
import { type GatewayRoute, getGatewayRoute } from '../../lib/services/state.ts'

import type {
  ServiceManager,
  ServiceManagerProject,
} from '../../lib/services/manager.ts'

type Flags = {
  json?: unknown
  'random-port'?: unknown
  'claim-domain'?: unknown
  'no-claim-domain'?: unknown
}

export type CliStartResolution = {
  /** Port to start the service on; `undefined` means no PORT env. */
  port: number | undefined
  /**
   * Whether the caller has explicitly opted to claim the configured
   * domain even though another project currently owns the route. `null`
   * means "leave the existing route untouched".
   */
  claimDomain: boolean | null
}

const isInteractive = (flags: Flags): boolean =>
  !flags.json &&
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  !flags['random-port']

const describeRouteOwner = (route: GatewayRoute): string =>
  `${route.project.slice(0, 8)}/${route.service}`

/**
 * Resolve the port a service should start on, prompting the user when the
 * config port is in use and the session is interactive. In non-interactive
 * contexts (JSON output, no TTY, --random-port) we silently fall back to a
 * randomly allocated port to match the documented automation behaviour.
 *
 * When the port was allocated (i.e. config port was busy) and the service
 * has a configured domain owned by another project, we additionally prompt
 * the user about taking the domain over for this start. `--claim-domain`
 * and `--no-claim-domain` bypass the prompt in either direction.
 *
 * Returns `null` when the user explicitly aborts in an interactive prompt
 * or no free port could be allocated.
 */
export const resolveServicePortForCli = async (
  manager: ServiceManager,
  serviceName: string,
  flags: Flags,
  project: ServiceManagerProject,
): Promise<CliStartResolution | null> => {
  const forceRandom = !!flags['random-port']
  const resolved = await manager.resolveServicePort(serviceName, {
    forceRandom,
  })
  if (!resolved.success) {
    if (flags.json) {
      console.log(
        JSON.stringify({
          success: false,
          service: serviceName,
          message: resolved.message,
        }),
      )
    } else {
      console.error(resolved.message)
    }
    return null
  }

  const chosenPort = resolved.port
  const allocated = resolved.source === 'allocated'

  if (resolved.conflict) {
    if (!isInteractive(flags)) {
      if (!flags.json) {
        if (allocated && chosenPort !== undefined) {
          console.log(
            `Port ${resolved.configPort} is in use; using random port ${chosenPort} instead.`,
          )
        } else {
          console.error(
            `Port ${resolved.configPort} is in use and no free port could be allocated.`,
          )
        }
      }
      if (resolved.source === 'none') return null
    } else {
      const message =
        allocated && chosenPort !== undefined
          ? `Port ${resolved.configPort} is already in use. Start ${serviceName} on random port ${chosenPort} instead?`
          : `Port ${resolved.configPort} is already in use and no random port could be allocated. Continue anyway?`
      const accepted = await confirm(message)
      if (!accepted) {
        console.error(`Aborted: ${serviceName} not started.`)
        return null
      }
      if (resolved.source === 'none') return null
    }
  }

  // Decide whether to claim the configured domain when another project
  // already owns its route. Explicit flags override the prompt in either
  // direction; otherwise we prompt the user when the port was allocated
  // (the usual worktree case) and the domain is currently owned by a
  // different service.
  let claimDomain: boolean | null = null
  if (flags['claim-domain']) {
    claimDomain = true
  } else if (flags['no-claim-domain']) {
    claimDomain = false
  } else if (allocated) {
    const config = manager.getServiceConfig(serviceName)
    const domain = config?.http?.domain
    if (domain) {
      const existingRoute = await getGatewayRoute(domain)
      const ownedByOther =
        existingRoute !== null &&
        !(
          existingRoute.project === project.id &&
          existingRoute.service === serviceName
        )

      if (ownedByOther) {
        if (isInteractive(flags)) {
          claimDomain = await confirm(
            `Domain ${domain} is currently routed to ${describeRouteOwner(existingRoute)}. Override it to point at this start (port ${chosenPort})?`,
          )
        } else {
          // Non-interactive default: don't disturb the existing route.
          claimDomain = false
          if (!flags.json) {
            console.log(
              `Domain ${domain} is currently routed to ${describeRouteOwner(existingRoute)}; leaving the route untouched. Use --claim-domain to override.`,
            )
          }
        }
      }
    }
  }

  return { port: chosenPort, claimDomain }
}
