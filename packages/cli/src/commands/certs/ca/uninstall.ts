import { Command } from '../../../lib/command.ts'

export const certsCaUninstallCommand = new Command({
  name: 'certs:ca:uninstall',
  description:
    'Remove the local Certificate Authority from the system keychain',
  usage: 'certs ca uninstall',
  example: 'denvig certs ca uninstall',
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

    if (flags.json) {
      const { path } = await sdk.certs.ca.remove()
      console.log(JSON.stringify({ success: true, path }))
    } else {
      console.log('Removing CA from system keychain...')
      await sdk.certs.ca.remove()
      console.log('CA removed from system keychain.')
    }

    return { success: true, message: 'CA uninstalled from keychain.' }
  },
})
