import { chmodSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { getCertDir, getCertsDir, parseCertDomains } from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'

export const certsImportCommand = new Command({
  name: 'certs:import',
  description: 'Import an existing TLS certificate and private key',
  usage: 'certs import --key <path> --cert <path>',
  example: 'denvig certs import --key ./privkey.pem --cert ./fullchain.pem',
  args: [],
  completions: (_context, inputs) => {
    const prev = inputs[inputs.length - 2]
    if (prev === '--key' || prev === '--cert' || prev === '--name') {
      return []
    }
    return ['--key', '--cert', '--name']
  },
  flags: [
    {
      name: 'key',
      description: 'Path to the private key PEM file',
      required: true,
      type: 'string' as const,
    },
    {
      name: 'cert',
      description: 'Path to the certificate PEM file',
      required: true,
      type: 'string' as const,
    },
    {
      name: 'name',
      description:
        'Override the directory name for the imported certificate (defaults to auto-detected domain)',
      required: false,
      type: 'string' as const,
    },
  ],
  handler: ({ flags }) => {
    const privkeyPath = resolve(flags.key as string)
    const certPath = resolve(flags.cert as string)

    let certPem: string
    try {
      certPem = readFileSync(certPath, 'utf-8')
    } catch {
      console.error(`Could not read certificate file: ${certPath}`)
      return { success: false, message: 'Could not read certificate file.' }
    }

    const domains = parseCertDomains(certPem)
    if (domains.length === 0) {
      console.error('Could not determine domain from certificate.')
      return {
        success: false,
        message: 'Could not determine domain from certificate.',
      }
    }

    const nameOverride = flags.name as string | undefined
    const domain = nameOverride ?? domains[0]
    const certDir = nameOverride
      ? resolve(getCertsDir(), nameOverride)
      : getCertDir(domain)
    mkdirSync(certDir, { recursive: true })

    const destPrivkey = resolve(certDir, 'privkey.pem')
    const destFullchain = resolve(certDir, 'fullchain.pem')

    copyFileSync(privkeyPath, destPrivkey)
    chmodSync(destPrivkey, 0o600)
    copyFileSync(certPath, destFullchain)

    if (flags.json) {
      console.log(
        JSON.stringify({
          domain,
          privkey: destPrivkey,
          fullchain: destFullchain,
        }),
      )
    } else {
      console.log(`Certificate imported for ${domain}`)
      console.log(`  privkey:   ${destPrivkey}`)
      console.log(`  fullchain: ${destFullchain}`)
    }

    return { success: true, message: `Certificate imported for ${domain}.` }
  },
})
