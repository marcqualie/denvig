import {
  getCaCertPath,
  isCaInitialized,
  uninstallCaFromKeychain,
} from '../../../lib/certs.ts'
import { Command } from '../../../lib/command.ts'

export const certsCaUninstallCommand = new Command({
  name: 'certs:ca:uninstall',
  description:
    'Remove the local Certificate Authority from the system keychain',
  usage: 'certs ca uninstall',
  example: 'denvig certs ca uninstall',
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

    if (flags.json) {
      uninstallCaFromKeychain(caCertPath)
      console.log(JSON.stringify({ success: true, path: caCertPath }))
    } else {
      console.log('Removing CA from system keychain...')
      uninstallCaFromKeychain(caCertPath)
      console.log('CA removed from system keychain.')
    }

    return { success: true, message: 'CA uninstalled from keychain.' }
  },
})
