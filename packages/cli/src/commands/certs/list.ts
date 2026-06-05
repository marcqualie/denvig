import { type DenvigCertificate, DenvigSDK } from '@denvig/sdk'

import { Command } from '../../lib/command.ts'
import { relativeFormattedTime } from '../../lib/formatters/relative-time.ts'
import { COLORS, formatTable } from '../../lib/formatters/table.ts'

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

const expiryColor = (expires: Date, now: Date = new Date()): string => {
  const diffMs = expires.getTime() - now.getTime()
  if (diffMs < DAY_MS) return COLORS.red
  if (diffMs < WEEK_MS) return COLORS.yellow
  return COLORS.green
}

type CertEntry = {
  dir: string
  domains: string[]
  expires: Date
  status: string
}

/** Render the SDK certificate status into the CLI's display string. */
const displayStatus = (cert: DenvigCertificate): string => {
  if (cert.status === 'expired') return 'expired'
  if (cert.signedByLocalCa) {
    return cert.caTrusted ? 'valid (local-ca)' : 'untrusted'
  }
  return `valid (${cert.issuer ? cert.issuer.toLowerCase() : 'unknown'})`
}

type CertRow = {
  name: string
  expires: Date
  status: string
  depth: number
  isLast: boolean
  hasChildren: boolean
  parentPath: boolean[]
}

export const certsListCommand = new Command({
  name: 'certs:list',
  description: 'List all managed TLS certificates',
  usage: 'certs list',
  example: 'denvig certs list',
  args: [],
  flags: [],
  handler: async ({ flags }) => {
    const denvig = new DenvigSDK({ client: 'cli' })
    const certificates = await denvig.certificates.list()

    if (certificates.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        console.log('No certificates found.')
      }
      return { success: true, message: 'No certificates found.' }
    }

    const entries: CertEntry[] = certificates.map((cert) => ({
      dir: cert.name,
      domains: cert.domains,
      expires: new Date(cert.expires),
      status: displayStatus(cert),
    }))

    if (flags.json) {
      console.log(
        JSON.stringify(
          entries.map((e) => ({
            domains: e.domains,
            expires: e.expires.toISOString(),
            status: e.status,
          })),
        ),
      )
      return { success: true, message: 'Certificates listed.' }
    }

    // Build tree rows: each cert directory is a parent, domains are children
    const rows: CertRow[] = []
    for (const [i, entry] of entries.entries()) {
      const isLastEntry = i === entries.length - 1
      rows.push({
        name: entry.dir,
        expires: entry.expires,
        status: entry.status,
        depth: 0,
        isLast: isLastEntry,
        hasChildren: entry.domains.length > 0,
        parentPath: [],
      })
      for (const [j, domain] of entry.domains.entries()) {
        const isLastDomain = j === entry.domains.length - 1
        rows.push({
          name: domain,
          expires: entry.expires,
          status: entry.status,
          depth: 1,
          isLast: isLastDomain,
          hasChildren: false,
          parentPath: [isLastEntry],
        })
      }
    }

    const lines = formatTable({
      columns: [
        { header: 'Certificate', accessor: (e) => e.name },
        {
          header: 'Expires',
          accessor: (e) => {
            if (e.depth !== 0) return ''
            const iso = e.expires.toISOString().slice(0, 10)
            return `${iso} (${relativeFormattedTime(e.expires.toISOString())})`
          },
          format: (value, row) => {
            if (row.depth !== 0) return value
            const trimmed = value.trimEnd()
            if (!trimmed) return value
            const color = expiryColor(row.expires)
            const padding = ' '.repeat(value.length - trimmed.length)
            return `${color}${trimmed}${COLORS.reset}${padding}`
          },
        },
        {
          header: 'Status',
          accessor: (e) => (e.depth === 0 ? e.status : ''),
          format: (value, row) => {
            const trimmed = value.trim()
            if (!trimmed) return value
            if (row.status === 'expired')
              return `${COLORS.red}${trimmed}${COLORS.reset}`
            if (row.status === 'untrusted')
              return `${COLORS.yellow}${trimmed}${COLORS.reset}`
            if (row.status.startsWith('valid'))
              return `${COLORS.green}${trimmed}${COLORS.reset}`
            return trimmed
          },
        },
      ],
      data: rows,
      tree: {
        getDepth: (e) => e.depth,
        getIsLast: (e) => e.isLast,
        getHasChildren: (e) => e.hasChildren,
        getParentPath: (e) => e.parentPath,
      },
    })

    for (const line of lines) {
      console.log(line)
    }

    console.log('')
    console.log(
      `${entries.length} certificate${entries.length === 1 ? '' : 's'}`,
    )

    return { success: true, message: 'Certificates listed.' }
  },
})
