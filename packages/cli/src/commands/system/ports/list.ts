import { Command } from '../../../lib/command.ts'
import {
  formatBinding,
  formatPortDomains,
  formatPortProcess,
  formatPortService,
  formatScope,
} from '../../../lib/formatters/ports.ts'
import { formatTable } from '../../../lib/formatters/table.ts'

import type { SystemPort } from '@denvig/sdk'

export const systemPortsListCommand = new Command({
  name: 'system:ports:list',
  description: 'List TCP ports listening on this machine',
  usage: 'system ports [list] [--denvig]',
  example: 'denvig system ports',
  args: [],
  flags: [
    {
      name: 'denvig',
      description:
        'Only show ports owned by, or conflicting with, a denvig service',
      required: false,
      type: 'boolean',
      defaultValue: false,
    },
  ],
  handler: async ({ sdk, flags }) => {
    const ports = await sdk.ports.list({ denvig: flags.denvig as boolean })

    if (flags.json) {
      console.log(JSON.stringify(ports))
      return { success: true, message: 'Ports listed' }
    }

    if (ports.length === 0) {
      console.log(
        flags.denvig
          ? 'No listening ports are linked to denvig services.'
          : 'No listening TCP ports found.',
      )
      return { success: true, message: 'No ports found' }
    }

    const lines = formatTable<SystemPort>({
      columns: [
        { header: 'Port', accessor: (p) => String(p.port) },
        { header: 'Scope', accessor: (p) => formatScope(p.scope) },
        {
          header: 'Address',
          accessor: (p) => p.bindings.map(formatBinding).join(', '),
        },
        { header: 'Process', accessor: formatPortProcess },
        { header: 'Service', accessor: formatPortService },
        { header: 'Domains', accessor: formatPortDomains },
      ],
      data: ports,
    })
    for (const line of lines) console.log(line)

    const count = (scope: SystemPort['scope']) =>
      ports.filter((p) => p.scope === scope).length
    const linked = ports.filter((p) => p.service).length
    const conflicts = ports.filter((p) => p.conflicts.length > 0).length
    const hidden = ports.filter((p) => !p.process).length
    const withDomains = ports.filter((p) => p.domains.length > 0).length

    console.log('')
    console.log(
      `${ports.length} listening port${ports.length === 1 ? '' : 's'}: ${count('loopback')} loopback, ${count('network')} network, ${count('all')} all interfaces`,
    )
    console.log(
      `${linked} linked to denvig services, ${conflicts} with conflicts, ${withDomains} served through the gateway`,
    )
    if (hidden > 0) {
      console.log(
        `${hidden} owned by processes that are not visible to this user`,
      )
    }

    return { success: true, message: 'Ports listed' }
  },
})
