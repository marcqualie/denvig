import { DenvigValidationError } from '@denvig/sdk'

import { Command } from '../../../lib/command.ts'
import {
  formatBinding,
  formatPortDomains,
  formatPortService,
  formatScope,
} from '../../../lib/formatters/ports.ts'
import { COLORS } from '../../../lib/formatters/table.ts'

const SCOPE_DESCRIPTIONS = {
  loopback: 'this machine only',
  network: 'a specific network interface',
  all: 'all interfaces',
} as const

export const systemPortsInfoCommand = new Command({
  name: 'system:ports:info',
  description: 'Show which process is listening on a TCP port',
  usage: 'system ports info <port>',
  example: 'denvig system ports info 8080',
  args: [
    {
      name: 'port',
      description: 'The TCP port to inspect',
      required: true,
      type: 'number',
    },
  ],
  flags: [],
  handler: async ({ sdk, args, flags }) => {
    let info: Awaited<ReturnType<typeof sdk.ports.retrieve>>
    try {
      info = await sdk.ports.retrieve(args.port as number)
    } catch (e) {
      if (!(e instanceof DenvigValidationError)) throw e
      if (flags.json) {
        console.log(JSON.stringify({ success: false, message: e.message }))
      } else {
        console.error(e.message)
      }
      return { success: false, message: e.message }
    }

    if (flags.json) {
      console.log(JSON.stringify(info))
      return { success: true, message: 'Port info retrieved' }
    }

    if (!info.inUse) {
      console.log(`Port ${info.port} is not in use.`)
    }

    for (const listener of info.listeners) {
      console.log('')
      console.log(`${COLORS.bold}Port ${listener.port}/tcp${COLORS.reset}`)
      console.log('')
      if (listener.process) {
        const { pid, name, user, ppid, command } = listener.process
        console.log(`  Process:    ${name} (pid ${pid})`)
        if (user) console.log(`  User:       ${user}`)
        if (ppid !== null) console.log(`  Parent:     ${ppid}`)
        if (command) console.log(`  Command:    ${command}`)
        if (listener.pids.length > 1) {
          console.log(`  Pids:       ${listener.pids.join(', ')}`)
        }
      } else {
        console.log(
          '  Process:    unknown (not visible to this user, try running with sudo)',
        )
      }
      console.log(
        `  Scope:      ${formatScope(listener.scope)} (${SCOPE_DESCRIPTIONS[listener.scope]})`,
      )
      console.log(
        `  Addresses:  ${listener.bindings.map(formatBinding).join(', ')}`,
      )
      console.log(`  Service:    ${formatPortService(listener)}`)
      console.log(`  Domains:    ${formatPortDomains(listener)}`)
    }

    const unlisted = info.services.filter(
      (s) =>
        !info.listeners.some(
          (l) =>
            l.service?.identifier === s.identifier ||
            l.conflicts.some((c) => c.identifier === s.identifier),
        ),
    )
    if (unlisted.length > 0) {
      console.log('')
      console.log('Configured denvig services:')
      for (const service of unlisted) {
        console.log(`  ${service.identifier} (${service.status})`)
      }
    }

    return { success: true, message: 'Port info retrieved' }
  },
})
