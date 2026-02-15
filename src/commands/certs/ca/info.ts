import { X509Certificate } from 'node:crypto'
import { readFileSync } from 'node:fs'

import { getCaCertPath, isCaInitialized } from '../../../lib/certs.ts'
import { Command } from '../../../lib/command.ts'

export const certsCaInfoCommand = new Command({
  name: 'certs:ca:info',
  description: 'Display information about the local Certificate Authority',
  usage: 'certs ca info',
  example: 'denvig certs ca info',
  args: [],
  flags: [],
  handler: ({ flags }) => {
    if (!isCaInitialized()) {
      const message =
        'CA has not been initialized. Run `denvig certs ca install` first.'
      if (flags.json) {
        console.log(JSON.stringify({ success: false, error: message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    const caCertPath = getCaCertPath()
    const certPem = readFileSync(caCertPath, 'utf-8')
    const cert = new X509Certificate(certPem)

    const info = {
      subject: cert.subject,
      issuer: cert.issuer,
      validFrom: cert.validFrom,
      validTo: cert.validTo,
      serialNumber: cert.serialNumber,
      fingerprint256: cert.fingerprint256,
      path: caCertPath,
    }

    if (flags.json) {
      console.log(JSON.stringify(info))
      return { success: true, message: 'CA info displayed.' }
    }

    console.log('Subject:       ', info.subject)
    console.log('Issuer:        ', info.issuer)
    console.log('Valid from:    ', info.validFrom)
    console.log('Valid to:      ', info.validTo)
    console.log('Serial:        ', info.serialNumber)
    console.log('Fingerprint:   ', info.fingerprint256)
    console.log('Path:          ', info.path)

    return { success: true, message: 'CA info displayed.' }
  },
})
