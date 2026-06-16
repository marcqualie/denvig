import { confirm } from '../input.ts'

import type { ServiceManager } from '@denvig/sdk/internal'

type Flags = {
  json?: unknown
  port?: unknown
}

export type CliStartResolution = {
  /** Port to start the service on; `undefined` means no PORT env. */
  port: number | undefined
}

/**
 * Parse the `--port` flag into the shape `resolveServicePort` expects: a
 * specific number, the literal `'random'`, or `undefined` when the flag was
 * omitted. Returns an error message for any other value.
 */
const parsePortFlag = (
  value: unknown,
):
  | { ok: true; port: number | 'random' | undefined }
  | { ok: false; message: string } => {
  if (value === undefined) return { ok: true, port: undefined }
  if (typeof value !== 'string') {
    return { ok: false, message: 'Invalid --port value.' }
  }
  if (value === 'random') return { ok: true, port: 'random' }
  const port = Number(value)
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    return {
      ok: false,
      message: `Invalid --port "${value}". Use a port number (1-65535) or "random".`,
    }
  }
  return { ok: true, port }
}

const isInteractive = (
  flags: Flags,
  requestedPort: number | 'random' | undefined,
): boolean =>
  !flags.json &&
  process.stdin.isTTY === true &&
  process.stdout.isTTY === true &&
  requestedPort !== 'random'

/**
 * Resolve the port a service should start on, prompting the user when the
 * chosen port is in use and the session is interactive. In non-interactive
 * contexts (JSON output, no TTY, `--port random`) we silently fall back to a
 * randomly allocated port to match the documented automation behaviour.
 *
 * Returns `null` when the user explicitly aborts in an interactive prompt,
 * passes an invalid `--port` value, or no free port could be allocated.
 */
export const resolveServicePortForCli = async (
  manager: ServiceManager,
  serviceName: string,
  flags: Flags,
): Promise<CliStartResolution | null> => {
  const parsedPort = parsePortFlag(flags.port)
  if (!parsedPort.ok) {
    if (flags.json) {
      console.log(
        JSON.stringify({
          success: false,
          service: serviceName,
          message: parsedPort.message,
        }),
      )
    } else {
      console.error(parsedPort.message)
    }
    return null
  }
  const requestedPort = parsedPort.port
  const resolved = await manager.resolveServicePort(serviceName, {
    port: requestedPort,
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
    if (!isInteractive(flags, requestedPort)) {
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
