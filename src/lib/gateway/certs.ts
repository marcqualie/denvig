import { access } from 'node:fs/promises'
import { homedir } from 'node:os'
import { resolve } from 'node:path'

import {
  generateDomainCert,
  isCaInitialized,
  loadCaCert,
  writeDomainCertFiles,
} from '../certs.ts'

/**
 * Resolve a cert path, converting 'auto' to the denvig-managed path.
 * @param path - The configured path (may be 'auto' or a relative/absolute path)
 * @param domain - The service domain (used when path is 'auto')
 * @param projectPath - The project root (used for relative paths)
 * @param type - The type of cert file ('cert' or 'key')
 * @returns The resolved absolute path
 */
export function resolveCertPath(
  path: string | undefined,
  domain: string,
  projectPath: string,
  type: 'cert' | 'key',
): string | null {
  if (!path) {
    return null
  }

  if (path === 'auto') {
    const filename = type === 'cert' ? 'fullchain.pem' : 'privkey.pem'
    return resolve(homedir(), '.denvig', 'certs', domain, filename)
  }

  // Resolve relative paths against project path
  return resolve(projectPath, path)
}

/**
 * Check if a cert path is set to 'auto' (denvig-managed).
 */
export function isAutoCertPath(path: string | undefined): boolean {
  return path === 'auto'
}

/**
 * Get the denvig-managed certs directory for a domain.
 */
export function getAutoCertDir(domain: string): string {
  return resolve(homedir(), '.denvig', 'certs', domain)
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

export type CertificateStatus = {
  status: 'exists' | 'generated' | 'error' | 'not_configured'
  domains: string[]
  certPath?: string
  keyPath?: string
  message?: string
}

/**
 * Ensure certificates exist for a service, generating them if needed.
 */
export async function ensureCertificates(options: {
  domain: string
  cnames?: string[]
  certPath?: string
  keyPath?: string
  projectPath: string
}): Promise<CertificateStatus> {
  const {
    domain,
    cnames,
    certPath: configCertPath,
    keyPath: configKeyPath,
    projectPath,
  } = options
  const allDomains = [domain, ...(cnames || [])]

  // Resolve cert paths
  const certPath = resolveCertPath(configCertPath, domain, projectPath, 'cert')
  const keyPath = resolveCertPath(configKeyPath, domain, projectPath, 'key')

  if (!certPath || !keyPath) {
    return {
      status: 'not_configured',
      domains: allDomains,
      message: 'No certPath/keyPath configured',
    }
  }

  // Check if certs already exist
  const certExists = await fileExists(certPath)
  const keyExists = await fileExists(keyPath)

  if (certExists && keyExists) {
    return {
      status: 'exists',
      domains: allDomains,
      certPath,
      keyPath,
    }
  }

  // Check that the local CA is initialized
  if (!isCaInitialized()) {
    return {
      status: 'error',
      domains: allDomains,
      certPath,
      keyPath,
      message: 'Local CA is not initialized. Run: denvig certs init',
    }
  }

  // Generate certificates using the built-in CA
  try {
    const { cert: caCert, key: caKey } = await loadCaCert()
    const { privkey, fullchain } = await generateDomainCert(
      domain,
      caCert,
      caKey,
    )
    writeDomainCertFiles(domain, privkey, fullchain)

    return {
      status: 'generated',
      domains: allDomains,
      certPath,
      keyPath,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      status: 'error',
      domains: allDomains,
      certPath,
      keyPath,
      message: `Failed to generate certificates: ${message}`,
    }
  }
}
