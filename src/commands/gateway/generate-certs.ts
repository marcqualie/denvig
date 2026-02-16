import { isCaInitialized } from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'
import {
  findCertForDomain,
  generateMissingCerts,
  groupDomainsForCertGeneration,
} from '../../lib/gateway/certs.ts'

type CertResult = {
  certDomain: string
  coveredDomains: string[]
  certDir: string
  status: 'exists' | 'generated'
}

export const gatewayGenerateCertsCommand = new Command({
  name: 'gateway:generate-certs',
  description: 'Generate SSL certificates for services with http.secure',
  usage: 'gateway generate-certs',
  example: 'gateway generate-certs',
  args: [],
  flags: [],
  handler: async ({ project, flags }) => {
    const services = project.config.services || {}

    // Check that the local CA is initialized
    if (!isCaInitialized()) {
      console.error('Local CA is not initialized. Run: denvig certs init')
      return { success: false, message: 'Local CA not initialized' }
    }

    // Collect all domains from services with secure: true
    const allDomains: string[] = []
    for (const [, config] of Object.entries(services)) {
      if (config.http?.domain && config.http.secure) {
        allDomains.push(config.http.domain)
        if (config.http.cnames) {
          allDomains.push(...config.http.cnames)
        }
      }
    }

    if (allDomains.length === 0) {
      console.log('No services with http.secure: true configured.')
      return {
        success: true,
        message: 'No domains to generate certificates for',
      }
    }

    // Check which domains already have certs
    const existing = new Map<string, string>()
    const uncovered: string[] = []
    for (const domain of allDomains) {
      const certDir = findCertForDomain(domain)
      if (certDir) {
        existing.set(domain, certDir)
      } else {
        uncovered.push(domain)
      }
    }

    // Generate missing certs (grouped by parent domain)
    const generated = new Map<string, string>()
    if (uncovered.length > 0) {
      const certMap = await generateMissingCerts(uncovered)
      for (const [domain, certDir] of certMap) {
        generated.set(domain, certDir)
      }
    }

    // Build results grouped by cert domain
    const results: CertResult[] = []
    const groups = groupDomainsForCertGeneration(allDomains)

    for (const [certDomain, coveredDomains] of groups) {
      const firstDomain = coveredDomains[0]
      const certDir = existing.get(firstDomain) || generated.get(firstDomain)
      if (certDir) {
        const wasExisting = existing.has(firstDomain)
        results.push({
          certDomain,
          coveredDomains,
          certDir,
          status: wasExisting ? 'exists' : 'generated',
        })
      }
    }

    // Output results
    if (flags.json) {
      console.log(JSON.stringify(results, null, 2))
    } else {
      console.log('')
      console.log('SSL Certificates:')
      console.log('')

      for (const result of results) {
        const statusIcon = result.status === 'exists' ? '✓' : '+'
        const statusLabel = result.status === 'exists' ? 'exists' : 'generated'

        console.log(`${statusIcon} ${result.certDomain} [${statusLabel}]`)
        if (
          result.coveredDomains.length > 1 ||
          result.coveredDomains[0] !== result.certDomain
        ) {
          console.log(`  covers: ${result.coveredDomains.join(', ')}`)
        }
        console.log(`  path:   ${result.certDir}`)
        console.log('')
      }

      if (uncovered.length === 0) {
        console.log('All domains already have matching certificates.')
        console.log('')
      }
    }

    return {
      success: true,
      message: 'Certificates processed successfully',
    }
  },
})
