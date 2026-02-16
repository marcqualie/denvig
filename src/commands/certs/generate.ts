import { existsSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  generateDomainCert,
  getCertDir,
  isCaInitialized,
  loadCaCert,
  writeDomainCertFiles,
} from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'
import { confirm } from '../../lib/input.ts'

export const certsGenerateCommand = new Command({
  name: 'certs:generate',
  description: 'Generate a TLS certificate for a domain signed by the local CA',
  usage: 'certs generate <domain>',
  example: 'denvig certs generate "*.denvig.localhost"',
  args: [
    {
      name: 'domain',
      description:
        'Domain name to generate a certificate for (e.g., *.denvig.localhost)',
      required: true,
      type: 'string' as const,
    },
  ],
  flags: [],
  handler: async ({ args, flags }) => {
    const domain = args.domain as string

    if (!isCaInitialized()) {
      console.error('CA not initialized. Run `denvig certs init` first.')
      return { success: false, message: 'CA not initialized.' }
    }

    const certDir = getCertDir(domain)
    if (existsSync(certDir) && !flags.json) {
      const confirmed = await confirm(
        `Certificate already exists for ${domain}. Overwrite?`,
      )
      if (!confirmed) {
        console.log('Cancelled.')
        return { success: true, message: 'Cancelled.' }
      }
    }

    const { cert: caCert, key: caKey } = await loadCaCert()
    const { privkey, fullchain } = await generateDomainCert(
      domain,
      caCert,
      caKey,
    )
    writeDomainCertFiles(domain, privkey, fullchain)

    if (flags.json) {
      console.log(
        JSON.stringify({
          domain,
          privkey: resolve(certDir, 'privkey.pem'),
          fullchain: resolve(certDir, 'fullchain.pem'),
        }),
      )
    } else {
      console.log(`Certificate generated for ${domain}`)
      console.log(`  privkey:   ${resolve(certDir, 'privkey.pem')}`)
      console.log(`  fullchain: ${resolve(certDir, 'fullchain.pem')}`)
    }

    return { success: true, message: `Certificate generated for ${domain}.` }
  },
})
