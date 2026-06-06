import { X509Certificate } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs'
import { basename, resolve } from 'node:path'

import {
  findCertFile,
  generateCaCert,
  generateDomainCert,
  getCaCertPath,
  getCertDir,
  getCertExpiry,
  getCertIssuerCN,
  getCertsDir,
  installCaToKeychain,
  isCaInitialized,
  isCaTrustedInKeychain,
  isCertIssuedBy,
  isIssuedByLocalCa,
  loadCaCert,
  parseCertDomains,
  uninstallCaFromKeychain,
  writeCaFiles,
  writeDomainCertFiles,
} from '../lib/certs.ts'
import { DenvigValidationError } from '../lib/errors.ts'

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
 * `denvig certs list` and `sdk.certs.list()`.
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

/** A managed certificate's location on disk. */
export type CertificateLocation = {
  /** The certificate directory name. */
  name: string
  /** Absolute path of the certificate directory. */
  path: string
  /** Files within the certificate directory. */
  files: string[]
}

export type CertificateRef = {
  /** Resolve by domain (mapped to its certificate directory). */
  domain?: string
  /** Resolve by certificate directory name. */
  name?: string
}

const resolveCertDir = (ref: CertificateRef): string => {
  if (ref.name) return resolve(getCertsDir(), ref.name)
  if (ref.domain) return getCertDir(ref.domain)
  throw new DenvigValidationError(
    'A certificate `domain` or `name` is required.',
  )
}

/** Look up a managed certificate by domain or directory name. */
export const retrieveCertificate = async (
  ref: CertificateRef,
): Promise<CertificateLocation | null> => {
  const certDir = resolveCertDir(ref)
  if (!existsSync(certDir) || !statSync(certDir).isDirectory()) return null
  return { name: basename(certDir), path: certDir, files: readdirSync(certDir) }
}

export type CreateCertificateOptions = {
  /** Domain to issue a certificate for (e.g. `hello.denvig.me`, `*.denvig.me`). */
  domain: string
  /** Overwrite an existing certificate for the domain. */
  force?: boolean
}

export type CreateCertificateResult = {
  domain: string
  name: string
  privkey: string
  fullchain: string
}

/**
 * Issue a TLS certificate for a domain, signed by the local CA. Requires the CA
 * to be configured (see `ca.configure()`).
 */
export const createCertificate = async (
  options: CreateCertificateOptions,
): Promise<CreateCertificateResult> => {
  const { domain, force } = options
  if (!(await isCaInitialized())) {
    throw new DenvigValidationError(
      'The local CA is not configured. Run `ca.configure()` first.',
    )
  }

  const certDir = getCertDir(domain)
  if (existsSync(certDir) && !force) {
    throw new DenvigValidationError(
      `A certificate already exists for "${domain}". Pass force to overwrite.`,
    )
  }

  const { cert: caCert, key: caKey } = await loadCaCert()
  const { privkey, fullchain } = await generateDomainCert(domain, caCert, caKey)
  await writeDomainCertFiles(domain, privkey, fullchain)

  return {
    domain,
    name: basename(certDir),
    privkey: resolve(certDir, 'privkey.pem'),
    fullchain: resolve(certDir, 'fullchain.pem'),
  }
}

export type RemoveCertificateResult = {
  name: string
  files: string[]
}

/** Remove a managed certificate by domain or directory name. */
export const removeCertificate = async (
  ref: CertificateRef,
): Promise<RemoveCertificateResult> => {
  const cert = await retrieveCertificate(ref)
  if (!cert) {
    throw new DenvigValidationError(
      `Certificate "${ref.name ?? ref.domain}" not found.`,
    )
  }
  rmSync(cert.path, { recursive: true })
  return { name: cert.name, files: cert.files }
}

export type ImportCertificateOptions = {
  /** Path to the private key PEM file. */
  keyPath: string
  /** Path to the certificate (fullchain) PEM file. */
  certPath: string
  /** Override the certificate directory name (defaults to the detected domain). */
  name?: string
}

export type ImportCertificateResult = {
  domain: string
  name: string
  privkey: string
  fullchain: string
}

/** Import an existing key/certificate pair into the managed certs directory. */
export const importCertificate = async (
  options: ImportCertificateOptions,
): Promise<ImportCertificateResult> => {
  const keyPath = resolve(options.keyPath)
  const certPath = resolve(options.certPath)

  let certPem: string
  try {
    certPem = readFileSync(certPath, 'utf-8')
  } catch {
    throw new DenvigValidationError(
      `Could not read certificate file: ${certPath}`,
    )
  }

  const domains = parseCertDomains(certPem)
  if (domains.length === 0) {
    throw new DenvigValidationError(
      'Could not determine a domain from the certificate.',
    )
  }

  const nameOverride = options.name?.replace(/^\*\./, '_wildcard.')
  const domain = nameOverride ?? domains[0]
  const certDir = nameOverride
    ? resolve(getCertsDir(), nameOverride)
    : getCertDir(domain)
  mkdirSync(certDir, { recursive: true })

  const privkey = resolve(certDir, 'privkey.pem')
  const fullchain = resolve(certDir, 'fullchain.pem')
  copyFileSync(keyPath, privkey)
  chmodSync(privkey, 0o600)
  copyFileSync(certPath, fullchain)

  return { domain, name: basename(certDir), privkey, fullchain }
}

/** Status of the local Certificate Authority. */
export type CaStatus = {
  /** Whether the CA certificate and key exist on disk. */
  initialized: boolean
  /** Whether the CA is trusted in the system keychain. */
  trusted: boolean
  /** Absolute path of the CA certificate. */
  path: string
  subject?: string
  issuer?: string
  validFrom?: string
  validTo?: string
  serialNumber?: string
  fingerprint256?: string
}

/** Report whether the local CA is configured, and its certificate details. */
export const getCaStatus = async (): Promise<CaStatus> => {
  const path = getCaCertPath()
  if (!(await isCaInitialized())) {
    return { initialized: false, trusted: false, path }
  }

  const trusted = await isCaTrustedInKeychain()
  const cert = new X509Certificate(readFileSync(path, 'utf-8'))
  return {
    initialized: true,
    trusted,
    path,
    subject: cert.subject,
    issuer: cert.issuer,
    validFrom: cert.validFrom,
    validTo: cert.validTo,
    serialNumber: cert.serialNumber,
    fingerprint256: cert.fingerprint256,
  }
}

export type ConfigureCaResult = {
  /** Whether a new CA was generated (false when an existing CA was reused). */
  created: boolean
  /** Absolute path of the CA certificate. */
  path: string
}

/**
 * Configure the local CA: generate it if missing, then (re)install it into the
 * system keychain so locally-signed certificates are trusted.
 */
export const configureCa = async (): Promise<ConfigureCaResult> => {
  const path = getCaCertPath()
  if (await isCaInitialized()) {
    installCaToKeychain(path)
    return { created: false, path }
  }

  const { certPem, keyPem } = await generateCaCert()
  await writeCaFiles(certPem, keyPem)
  installCaToKeychain(path)
  return { created: true, path }
}

/** Remove the local CA from the system keychain. */
export const removeCa = async (): Promise<{ path: string }> => {
  const path = getCaCertPath()
  if (!(await isCaInitialized())) {
    throw new DenvigValidationError(
      'The local CA is not configured. Run `ca.configure()` first.',
    )
  }
  uninstallCaFromKeychain(path)
  return { path }
}
