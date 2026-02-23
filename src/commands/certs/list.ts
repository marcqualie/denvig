import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  getCaCertPath,
  getCertExpiry,
  getCertIssuerCN,
  getCertsDir,
  isCaInitialized,
  isCaTrustedInKeychain,
  isCertIssuedBy,
  isIssuedByLocalCa,
  parseCertDomains,
} from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'
import { COLORS, formatTable } from '../../lib/formatters/table.ts'

type CertEntry = {
  dir: string
  domains: string[]
  expires: Date
  status: string
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

const findCertFile = (dir: string): string | null => {
  const fullchain = resolve(dir, 'fullchain.pem')
  const cert = resolve(dir, 'cert.pem')
  try {
    statSync(fullchain)
    return fullchain
  } catch {}
  try {
    statSync(cert)
    return cert
  } catch {}
  return null
}

export const certsListCommand = new Command({
  name: 'certs:list',
  description: 'List all managed TLS certificates',
  usage: 'certs list',
  example: 'denvig certs list',
  args: [],
  flags: [],
  handler: async ({ flags }) => {
    const certsDir = getCertsDir()

    let dirs: string[]
    try {
      dirs = readdirSync(certsDir).filter((name) => {
        try {
          return statSync(resolve(certsDir, name)).isDirectory()
        } catch {
          return false
        }
      })
    } catch {
      dirs = []
    }

    if (dirs.length === 0) {
      if (flags.json) {
        console.log(JSON.stringify([]))
      } else {
        console.log('No certificates found.')
      }
      return { success: true, message: 'No certificates found.' }
    }

    // Load CA state once before iterating certs
    const caInitialized = await isCaInitialized()
    const caCertPem = caInitialized
      ? readFileSync(getCaCertPath(), 'utf-8')
      : null
    const caTrusted = caInitialized ? await isCaTrustedInKeychain() : false

    const entries: CertEntry[] = []

    for (const dir of dirs) {
      const certFile = findCertFile(resolve(certsDir, dir))
      if (!certFile) continue

      try {
        const pem = readFileSync(certFile, 'utf-8')
        const domains = parseCertDomains(pem)
        const expires = getCertExpiry(pem)

        const signedByLocalCa = caCertPem
          ? isCertIssuedBy(pem, caCertPem)
          : isIssuedByLocalCa(pem)
        const issuerCN = getCertIssuerCN(pem)

        let status: string
        if (expires <= new Date()) {
          status = 'expired'
        } else if (signedByLocalCa) {
          status = caTrusted ? 'valid (local-ca)' : 'untrusted'
        } else {
          const label = issuerCN ? issuerCN.toLowerCase() : 'unknown'
          status = `valid (${label})`
        }

        entries.push({
          dir,
          domains: domains.length > 0 ? domains : [dir],
          expires,
          status,
        })
      } catch {
        // Skip certs that can't be parsed
      }
    }

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
          accessor: (e) =>
            e.depth === 0 ? e.expires.toLocaleDateString() : '',
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
