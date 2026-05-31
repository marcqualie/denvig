import { existsSync, readdirSync, rmSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import { getCertsDir } from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'
import { confirm } from '../../lib/input.ts'

export const certsRmCommand = new Command({
  name: 'certs:rm',
  description: 'Remove a certificate by its directory name',
  usage: 'certs rm <name>',
  example: 'denvig certs rm _wildcard.upvio.dev',
  args: [
    {
      name: 'name',
      description: 'Certificate directory name (e.g., _wildcard.upvio.dev)',
      required: true,
      type: 'string' as const,
    },
  ],
  flags: [],
  handler: async ({ args, flags }) => {
    const name = args.name as string
    const certDir = resolve(getCertsDir(), name)

    if (!existsSync(certDir) || !statSync(certDir).isDirectory()) {
      const message = `Certificate "${name}" not found.`
      if (flags.json) {
        console.log(JSON.stringify({ success: false, name, message }))
      } else {
        console.error(message)
      }
      return { success: false, message }
    }

    const files = readdirSync(certDir)

    if (!flags.json) {
      console.log(`Certificate: ${name}`)
      for (const file of files) {
        console.log(`  ${file}`)
      }
      const confirmed = await confirm('Remove this certificate?')
      if (!confirmed) {
        console.log('Cancelled.')
        return { success: true, message: 'Cancelled.' }
      }
    }

    rmSync(certDir, { recursive: true })

    if (flags.json) {
      console.log(JSON.stringify({ success: true, name }))
    } else {
      console.log(`Removed ${name}`)
    }

    return { success: true, message: `Removed ${name}.` }
  },
})
