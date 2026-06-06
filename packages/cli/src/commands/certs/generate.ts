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
  handler: async ({ sdk, args, flags }) => {
    const domain = args.domain as string

    const ca = await sdk.certs.ca.status()
    if (!ca.initialized) {
      console.error('CA not initialized. Run `denvig certs init` first.')
      return { success: false, message: 'CA not initialized.' }
    }

    if (!flags.json) {
      const existing = await sdk.certs.retrieve({ domain })
      if (existing) {
        const confirmed = await confirm(
          `Certificate already exists for ${domain}. Overwrite?`,
        )
        if (!confirmed) {
          console.log('Cancelled.')
          return { success: true, message: 'Cancelled.' }
        }
      }
    }

    const result = await sdk.certs.create({ domain, force: true })

    if (flags.json) {
      console.log(
        JSON.stringify({
          domain: result.domain,
          privkey: result.privkey,
          fullchain: result.fullchain,
        }),
      )
    } else {
      console.log(`Certificate generated for ${domain}`)
      console.log(`  privkey:   ${result.privkey}`)
      console.log(`  fullchain: ${result.fullchain}`)
    }

    return { success: true, message: `Certificate generated for ${domain}.` }
  },
})
