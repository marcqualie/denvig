import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  findCertFile,
  getCaCertPath,
  getCertExpiry,
  getCertIssuerCN,
  getCertsDir,
  isCaInitialized,
  isCaTrustedInKeychain,
  isCertIssuedBy,
  isIssuedByLocalCa,
  parseCertDomains,
} from '../lib/certs.ts'

export type CertificateStatus = 'valid' | 'expired' | 'untrusted'

/** A managed TLS certificate under `~/.denvig/certs`. */
export type DenvigCertificate = {
  /** The certificate directory name. */
  name: string
  /** Domains the certificate is valid for (falls back to the directory name). */
  domains: string[]
  /** Issuer common name, when available. */
  issuer: string | null
  /** Expiry as an ISO 8601 timestamp. */
  expires: string
  /** `expired` when past expiry, `untrusted` for an untrusted local CA cert. */
  status: CertificateStatus
  /** Whether the certificate was signed by the local denvig CA. */
  signedByLocalCa: boolean
  /** Whether the local CA is currently trusted in the system keychain. */
  caTrusted: boolean
}

export type ListCertificatesOptions = {
  /** Only include certificates valid for this domain. */
  domain?: string
}

/**
 * Enumerate the managed certificates under `~/.denvig/certs`, parsing each one's
 * domains, expiry, issuer and trust status. This is the shared data path behind
 * `denvig certs list` and `sdk.certificates.list()`.
 */
export const listCertificates = async (
  options: ListCertificatesOptions = {},
): Promise<DenvigCertificate[]> => {
  const certsDir = getCertsDir()

  let dirs: string[]
  try {
    dirs = readdirSync(certsDir).filter((name) => {
      try {
        return statSync(resolve(certsDir, name)).isDirectory()
      } catch {
        return false
      }
    })
  } catch {
    dirs = []
  }

  if (dirs.length === 0) return []

  const caInitialized = await isCaInitialized()
  const caCertPem = caInitialized
    ? readFileSync(getCaCertPath(), 'utf-8')
    : null
  const caTrusted = caInitialized ? await isCaTrustedInKeychain() : false

  const now = new Date()
  const certs: DenvigCertificate[] = []

  for (const dir of dirs) {
    const certFile = findCertFile(resolve(certsDir, dir))
    if (!certFile) continue

    try {
      const pem = readFileSync(certFile, 'utf-8')
      const domains = parseCertDomains(pem)
      const expires = getCertExpiry(pem)
      const signedByLocalCa = caCertPem
        ? isCertIssuedBy(pem, caCertPem)
        : isIssuedByLocalCa(pem)
      const issuer = getCertIssuerCN(pem)

      let status: CertificateStatus
      if (expires <= now) {
        status = 'expired'
      } else if (signedByLocalCa && !caTrusted) {
        status = 'untrusted'
      } else {
        status = 'valid'
      }

      certs.push({
        name: dir,
        domains: domains.length > 0 ? domains : [dir],
        issuer,
        expires: expires.toISOString(),
        status,
        signedByLocalCa,
        caTrusted,
      })
    } catch {
      // Skip certs that can't be parsed.
    }
  }

  if (options.domain) {
    const domain = options.domain
    return certs.filter((cert) => cert.domains.includes(domain))
  }

  return certs
}
