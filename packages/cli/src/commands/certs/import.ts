import { DenvigValidationError } from '@denvig/sdk'
import { z } from 'zod'

import { Command } from '../../lib/command.ts'

const DomainSchema = z
  .string()
  .regex(
    /^(\*\.)?([a-zA-Z0-9]([a-zA-Z0-9-]*[a-zA-Z0-9])?\.)*[a-zA-Z]{2,}$/,
    'Must be a valid domain (e.g., example.com or *.example.com)',
  )

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
  handler: async ({ sdk, flags }) => {
    let name: string | undefined
    if (flags.name) {
      const result = DomainSchema.safeParse(flags.name)
      if (!result.success) {
        const message = result.error.issues[0]?.message ?? 'Invalid domain name'
        console.error(`Invalid --name value: ${message}`)
        return { success: false, message }
      }
      name = result.data
    }

    let imported: Awaited<ReturnType<typeof sdk.certs.import>>
    try {
      imported = await sdk.certs.import({
        keyPath: flags.key as string,
        certPath: flags.cert as string,
        name,
      })
    } catch (e) {
      if (e instanceof DenvigValidationError) {
        console.error(e.message)
        return { success: false, message: e.message }
      }
      throw e
    }

    if (flags.json) {
      console.log(
        JSON.stringify({
          domain: imported.domain,
          privkey: imported.privkey,
          fullchain: imported.fullchain,
        }),
      )
    } else {
      console.log(`Certificate imported for ${imported.domain}`)
      console.log(`  privkey:   ${imported.privkey}`)
      console.log(`  fullchain: ${imported.fullchain}`)
    }

    return {
      success: true,
      message: `Certificate imported for ${imported.domain}.`,
    }
  },
})
