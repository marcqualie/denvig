import {
  generateCaCert,
  getCaCertPath,
  installCaToKeychain,
  isCaInitialized,
  writeCaFiles,
} from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'

export const certsInitCommand = new Command({
  name: 'certs:init',
  description:
    'Initialize a local Certificate Authority and install it to the system keychain',
  usage: 'certs init',
  example: 'denvig certs init',
  args: [],
  flags: [],
  handler: () => {
    if (isCaInitialized()) {
      console.log('CA already exists at', getCaCertPath())
      console.log('Reinstalling CA to system keychain...')
      installCaToKeychain(getCaCertPath())
      console.log('CA reinstalled to system keychain.')
      return {
        success: true,
        message: 'CA already exists, reinstalled to keychain.',
      }
    }

    console.log('Generating new Certificate Authority...')
    const { certPem, keyPem } = generateCaCert()
    writeCaFiles(certPem, keyPem)
    console.log('CA certificate written to', getCaCertPath())

    console.log('Installing CA to system keychain...')
    installCaToKeychain(getCaCertPath())
    console.log('CA installed to system keychain.')

    return { success: true, message: 'CA initialized and installed.' }
  },
})
