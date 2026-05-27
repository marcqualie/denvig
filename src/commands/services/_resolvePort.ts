import { confirm } from '../../lib/input.ts'

import type { ServiceManager } from '../../lib/services/manager.ts'

type Flags = {
  json?: unknown
  'random-port'?: unknown
}

/**
 * Resolve the port a service should start on, prompting the user when the
 * config port is in use and the session is interactive. In non-interactive
 * contexts (JSON output, no TTY, --random-port) we silently fall back to a
 * randomly allocated port to match the documented automation behaviour.
 *
 * Returns `null` when the user explicitly aborts in an interactive prompt
 * or no free port could be allocated.
 */
export const resolveServicePortForCli = async (
  manager: ServiceManager,
  serviceName: string,
  flags: Flags,
): Promise<{ port: number | undefined } | null> => {
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

  if (!resolved.conflict) {
    return { port: resolved.port }
  }

  // Conflict on the config port. In TTY mode let the user choose; otherwise
  // fall back to the auto-allocated port we already picked.
  const isInteractive =
    !flags.json &&
    process.stdin.isTTY === true &&
    process.stdout.isTTY === true &&
    !forceRandom

  if (!isInteractive) {
    if (!flags.json) {
      if (resolved.source === 'allocated' && resolved.port !== undefined) {
        console.log(
          `Port ${resolved.configPort} is in use; using random port ${resolved.port} instead.`,
        )
      } else {
        console.error(
          `Port ${resolved.configPort} is in use and no free port could be allocated.`,
        )
      }
    }
    if (resolved.source === 'none') return null
    return { port: resolved.port }
  }

  const message =
    resolved.source === 'allocated' && resolved.port !== undefined
      ? `Port ${resolved.configPort} is already in use. Start ${serviceName} on random port ${resolved.port} instead?`
      : `Port ${resolved.configPort} is already in use and no random port could be allocated. Continue anyway?`
  const accepted = await confirm(message)
  if (!accepted) {
    console.error(`Aborted: ${serviceName} not started.`)
    return null
  }
  if (resolved.source === 'none') return null
  return { port: resolved.port }
}
