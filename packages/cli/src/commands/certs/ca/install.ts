import { Command } from '../../../lib/command.ts'

export const certsCaInstallCommand = new Command({
  name: 'certs:ca:install',
  description:
    'Initialize a local Certificate Authority and install it to the system keychain',
  usage: 'certs ca install',
  example: 'denvig certs ca install',
  args: [],
  flags: [],
  handler: async ({ sdk }) => {
    if ((await sdk.certs.ca.status()).initialized) {
      const { path } = await sdk.certs.ca.configure()
      console.log('CA already exists at', path)
      console.log('Reinstalling CA to system keychain...')
      console.log('CA reinstalled to system keychain.')
      return {
        success: true,
        message: 'CA already exists, reinstalled to keychain.',
      }
    }

    console.log('Generating new Certificate Authority...')
    const { path } = await sdk.certs.ca.configure()
    console.log('CA certificate written to', path)
    console.log('Installing CA to system keychain...')
    console.log('CA installed to system keychain.')

    return { success: true, message: 'CA initialized and installed.' }
  },
})
