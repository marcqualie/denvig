import { exec } from 'node:child_process'
import { access, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { promisify } from 'node:util'

import { Command } from '../../lib/command.ts'
import {
  getAutoCertDir,
  isAutoCertPath,
  resolveCertPath,
} from '../../lib/gateway/certs.ts'

const execAsync = promisify(exec)

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

/**
 * Check if mkcert is installed.
 */
async function isMkcertInstalled(): Promise<boolean> {
  try {
    await execAsync('which mkcert')
    return true
  } catch {
    return false
  }
}

/**
 * Generate certificates using mkcert.
 * @param domains - Array of domains to include in the certificate (domain + cnames)
 * @param certDir - Directory to write the certificate files
 */
async function generateCertWithMkcert(
  domains: string[],
  certDir: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    // Ensure directory exists
    await mkdir(certDir, { recursive: true })

    // Run mkcert to generate certs for all domains
    const domainArgs = domains.map((d) => `"${d}"`).join(' ')
    await execAsync(
      `cd "${certDir}" && mkcert -cert-file cert.pem -key-file privkey.pem ${domainArgs}`,
    )

    // Verify files were created
    const certPath = resolve(certDir, 'cert.pem')
    const keyPath = resolve(certDir, 'privkey.pem')
    const certExists = await fileExists(certPath)
    const keyExists = await fileExists(keyPath)

    if (!certExists || !keyExists) {
      return {
        success: false,
        message: 'mkcert completed but certificate files were not found',
      }
    }

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, message }
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

    // Check for mkcert installation
    const hasMkcert = await isMkcertInstalled()
    if (!hasMkcert) {
      console.error(
        'mkcert is not installed. Install it with: brew install mkcert',
      )
      console.error('Then run: mkcert -install')
      return { success: false, message: 'mkcert not installed' }
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

      // Determine the cert directory for generation
      const isAuto = isAutoCertPath(service.certPath)
      const certDir = isAuto
        ? getAutoCertDir(service.domain)
        : resolve(certPath, '..')

      // Include domain and cnames in the certificate
      const allDomains = [service.domain, ...(service.cnames || [])]

      const generateResult = await generateCertWithMkcert(allDomains, certDir)

      if (generateResult.success) {
        results.push({
          domain: service.domain,
          cnames: service.cnames,
          serviceName: service.name,
          certPath,
          keyPath,
          status: 'generated',
        })
      } else {
        results.push({
          domain: service.domain,
          cnames: service.cnames,
          serviceName: service.name,
          certPath,
          keyPath,
          status: 'error',
          message: generateResult.message,
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
