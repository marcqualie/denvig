import { confirm } from '../input.ts'

import type { ServiceManager } from '@denvig/sdk/internal'

type Flags = {
  json?: unknown
  'random-port'?: unknown
}

export type CliStartResolution = {
  /** Port to start the service on; `undefined` means no PORT env. */
  port: number | undefined
}

const isInteractive = (flags: Flags): boolean =>
  !flags.json &&
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  !flags['random-port']

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

  return { port: chosenPort }
}
