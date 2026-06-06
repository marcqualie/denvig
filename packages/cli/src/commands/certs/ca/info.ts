import { Command } from '../../../lib/command.ts'

export const certsCaInfoCommand = new Command({
  name: 'certs:ca:info',
  description: 'Display information about the local Certificate Authority',
  usage: 'certs ca info',
  example: 'denvig certs ca info',
  args: [],
  flags: [],
  handler: async ({ sdk, flags }) => {
    const ca = await sdk.certs.ca.status()

    if (!ca.initialized) {
      const message =
        'CA has not been initialized. Run `denvig certs ca install` first.'
      if (flags.json) {
        console.log(JSON.stringify({ success: false, error: message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    const info = {
      subject: ca.subject,
      issuer: ca.issuer,
      validFrom: ca.validFrom,
      validTo: ca.validTo,
      serialNumber: ca.serialNumber,
      fingerprint256: ca.fingerprint256,
      path: ca.path,
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
