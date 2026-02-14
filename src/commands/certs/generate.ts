import { resolve } from 'node:path'

import {
  generateDomainCert,
  getCertDir,
  isCaInitialized,
  loadCaCert,
  writeDomainCertFiles,
} from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'

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
  handler: ({ args, flags }) => {
    const domain = args.domain as string

    if (!isCaInitialized()) {
      console.error('CA not initialized. Run `denvig certs init` first.')
      return { success: false, message: 'CA not initialized.' }
    }

    const { cert: caCert, key: caKey } = loadCaCert()
    const { privkey, fullchain } = generateDomainCert(domain, caCert, caKey)
    const certDir = writeDomainCertFiles(domain, privkey, fullchain)

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
