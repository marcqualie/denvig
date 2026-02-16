import { access } from 'node:fs/promises'

import {
  generateDomainCert,
  isCaInitialized,
  loadCaCert,
  writeDomainCertFiles,
} from '../../lib/certs.ts'
import { Command } from '../../lib/command.ts'
import { resolveCertPath } from '../../lib/gateway/certs.ts'

type CertInfo = {
  domain: string
  cnames?: string[]
  serviceName: string
  certPath: string
  keyPath: string
  status: 'exists' | 'generated' | 'error'
  message?: string
}

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

export const gatewayGenerateCertsCommand = new Command({
  name: 'gateway:generate-certs',
  description: 'Generate SSL certificates for services with http.domain',
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

    // Find all services with http.domain configured
    const servicesWithDomains: Array<{
      name: string
      domain: string
      cnames?: string[]
      certPath?: string
      keyPath?: string
      secure?: boolean
    }> = []

    for (const [name, config] of Object.entries(services)) {
      if (config.http?.domain) {
        servicesWithDomains.push({
          name,
          domain: config.http.domain,
          cnames: config.http.cnames,
          certPath: config.http.certPath,
          keyPath: config.http.keyPath,
          secure: config.http.secure,
        })
      }
    }

    if (servicesWithDomains.length === 0) {
      console.log('No services with http.domain configured.')
      return {
        success: true,
        message: 'No domains to generate certificates for',
      }
    }

    // Load the CA once for all cert generation
    const { cert: caCert, key: caKey } = await loadCaCert()

    const results: CertInfo[] = []

    for (const service of servicesWithDomains) {
      // Resolve cert paths (handles 'auto' and relative paths)
      const certPath = resolveCertPath(
        service.certPath,
        service.domain,
        project.path,
        'cert',
      )
      const keyPath = resolveCertPath(
        service.keyPath,
        service.domain,
        project.path,
        'key',
      )

      if (!certPath || !keyPath) {
        // No cert paths configured
        results.push({
          domain: service.domain,
          serviceName: service.name,
          certPath: '(not configured)',
          keyPath: '(not configured)',
          status: 'error',
          message:
            'No certPath/keyPath configured. Set to "auto" for denvig-managed certs.',
        })
        continue
      }

      // Check if certs already exist
      const certExists = await fileExists(certPath)
      const keyExists = await fileExists(keyPath)

      if (certExists && keyExists) {
        results.push({
          domain: service.domain,
          cnames: service.cnames,
          serviceName: service.name,
          certPath,
          keyPath,
          status: 'exists',
        })
        continue
      }

      // Generate certificate using the built-in CA
      try {
        const { privkey, fullchain } = await generateDomainCert(
          service.domain,
          caCert,
          caKey,
        )
        writeDomainCertFiles(service.domain, privkey, fullchain)

        results.push({
          domain: service.domain,
          cnames: service.cnames,
          serviceName: service.name,
          certPath,
          keyPath,
          status: 'generated',
        })
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unknown error'
        results.push({
          domain: service.domain,
          cnames: service.cnames,
          serviceName: service.name,
          certPath,
          keyPath,
          status: 'error',
          message,
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
        const statusIcon =
          result.status === 'exists'
            ? '✓'
            : result.status === 'generated'
              ? '+'
              : '✗'
        const statusLabel =
          result.status === 'exists'
            ? 'exists'
            : result.status === 'generated'
              ? 'generated'
              : 'error'

        const cnamesInfo =
          result.cnames && result.cnames.length > 0
            ? ` + ${result.cnames.length} cname${result.cnames.length > 1 ? 's' : ''}`
            : ''
        console.log(
          `${statusIcon} ${result.domain}${cnamesInfo} (${result.serviceName}) [${statusLabel}]`,
        )
        if (result.cnames && result.cnames.length > 0) {
          console.log(`  cnames: ${result.cnames.join(', ')}`)
        }
        console.log(`  cert: ${result.certPath}`)
        console.log(`  key:  ${result.keyPath}`)
        if (result.message) {
          console.log(`  error: ${result.message}`)
        }
        console.log('')
      }

      // Print tip for unconfigured services
      const unconfigured = results.filter(
        (r) => r.status === 'error' && r.certPath === '(not configured)',
      )
      if (unconfigured.length > 0) {
        console.log(
          'Tip: Set certPath and keyPath to "auto" in .denvig.yml for denvig-managed certs:',
        )
        console.log('')
        console.log('  services:')
        console.log('    my-service:')
        console.log('      http:')
        console.log('        domain: example.localhost')
        console.log('        certPath: auto')
        console.log('        keyPath: auto')
        console.log('')
      }
    }

    const hasErrors = results.some((r) => r.status === 'error')
    return {
      success: !hasErrors,
      message: hasErrors
        ? 'Some certificates could not be generated'
        : 'Certificates processed successfully',
    }
  },
})
