import {
  generateCaCert,
  getCaCertPath,
  installCaToKeychain,
  isCaInitialized,
  writeCaFiles,
} from '../certs.ts'
import { findCertForDomain, generateMissingCerts } from '../gateway/certs.ts'
import { confirm } from '../input.ts'

import type { ProjectConfigSchema } from '../../schemas/config.ts'

type ServiceConfig = NonNullable<ProjectConfigSchema['services']>[string]

/**
 * Ensure TLS certificates exist for a service that requires HTTPS.
 * Prompts the user to generate a CA and domain certs if missing.
 * In non-interactive mode (json), logs warnings instead of prompting.
 */
export async function ensureServiceCerts(
  serviceName: string,
  serviceConfig: ServiceConfig,
  options: { json: boolean },
): Promise<void> {
  const http = serviceConfig.http
  if (!http?.secure || !http.domain) return

  const domain = http.domain
  const allDomains = [domain, ...(http.cnames ?? [])]

  // Check if certs already exist for all domains
  const uncovered: string[] = []
  for (const d of allDomains) {
    const existing = await findCertForDomain(d)
    if (!existing) {
      uncovered.push(d)
    }
  }
  if (uncovered.length === 0) return

  // Ensure CA is initialized
  const caReady = await isCaInitialized()
  if (!caReady) {
    if (options.json) {
      console.error(
        `Warning: No local CA found. Skipping cert generation for ${serviceName}.`,
      )
      return
    }

    const shouldInstallCa = await confirm(
      'No local CA found. Generate and install one?',
    )
    if (!shouldInstallCa) {
      console.log('Skipping certificate setup.')
      return
    }

    const { certPem, keyPem } = await generateCaCert()
    await writeCaFiles(certPem, keyPem)
    installCaToKeychain(getCaCertPath())
  }

  // Generate missing domain certs
  if (options.json) {
    console.error(
      `Warning: No TLS certificate for ${uncovered.join(', ')}. Skipping cert generation.`,
    )
    return
  }

  const shouldGenerate = await confirm(
    `Generate TLS certificate for ${domain}?`,
  )
  if (!shouldGenerate) {
    console.log('Skipping certificate generation.')
    return
  }

  await generateMissingCerts(uncovered)
}
