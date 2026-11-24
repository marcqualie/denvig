import { constants } from 'node:os'
import { DenvigError } from '@denvig/sdk'

import { Command } from '../../../lib/command.ts'

export const systemPortsKillCommand = new Command({
  name: 'system:ports:kill',
  description: 'Kill the process listening on a TCP port',
  usage: 'system ports kill <port> [--signal <signal>] [--force]',
  example: 'denvig system ports kill 8080',
  args: [
    {
      name: 'port',
      description: 'The TCP port to free up',
      required: true,
      type: 'number',
    },
  ],
  flags: [
    {
      name: 'signal',
      description: 'Signal to send to the process (eg. SIGTERM, SIGKILL)',
      required: false,
      type: 'string',
      defaultValue: 'SIGTERM',
    },
    {
      name: 'force',
      description:
        'Kill the process even when it belongs to a running denvig service',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ sdk, args, flags }) => {
    const fail = (message: string) => {
      if (flags.json) {
        console.log(JSON.stringify({ success: false, message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    const rawSignal = String(flags.signal).toUpperCase()
    const signal = (
      rawSignal.startsWith('SIG') ? rawSignal : `SIG${rawSignal}`
    ) as NodeJS.Signals
    if (!(signal in constants.signals)) {
      return fail(`Unknown signal "${flags.signal}".`)
    }

    let result: Awaited<ReturnType<typeof sdk.ports.kill>>
    try {
      result = await sdk.ports.kill(args.port as number, {
        signal,
        force: flags.force as boolean,
      })
    } catch (e) {
      if (e instanceof DenvigError) return fail(e.message)
      throw e
    }

    if (flags.json) {
      console.log(JSON.stringify({ success: result.released, ...result }))
      return {
        success: result.released,
        message: result.released ? 'Port released' : 'Port still in use',
      }
    }

    for (const proc of result.killed) {
      console.log(`Sent ${result.signal} to ${proc.name} (pid ${proc.pid})`)
    }
    for (const failure of result.failed) {
      console.error(`Failed to signal pid ${failure.pid}: ${failure.message}`)
    }

    if (result.released) {
      console.log(`Port ${result.port} is now free.`)
      return { success: true, message: 'Port released' }
    }

    const hint =
      result.signal === 'SIGKILL' ? '' : ' Try again with --signal SIGKILL.'
    console.error(`Port ${result.port} is still in use.${hint}`)
    return { success: false, message: 'Port still in use' }
  },
})
