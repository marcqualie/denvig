import { execSync, spawnSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { pathExists } from './safeReadFile.ts'

import type forge from 'node-forge'

let _nodeForge: typeof forge | undefined
const importNodeForge = async (): Promise<typeof forge> => {
  if (!_nodeForge) {
    _nodeForge = (await import('node-forge')).default
  }
  return _nodeForge
}

const HOME = process.env.HOME || ''

/**
 * Directory containing the CA key and certificate.
 */
export const getCaDir = (): string => resolve(`${HOME}/.denvig/ca`)

/**
 * Directory containing all domain certificate directories.
 */
export const getCertsDir = (): string => resolve(`${HOME}/.denvig/certs`)

/**
 * Path to the CA private key.
 */
export const getCaKeyPath = (): string => resolve(getCaDir(), 'rootCA-key.pem')

/**
 * Path to the CA certificate.
 */
export const getCaCertPath = (): string => resolve(getCaDir(), 'rootCA.pem')

/**
 * Directory for a specific domain's certificates.
 * Wildcards are converted to `_wildcard` (e.g., `*.example.com` → `_wildcard.example.com`).
 */
export const getCertDir = (domain: string): string => {
  const dirName = domain.replace(/^\*/, '_wildcard')
  return resolve(getCertsDir(), dirName)
}

/**
 * Load the CA certificate and private key from disk.
 */
export const loadCaCert = async (): Promise<{
  cert: forge.pki.Certificate
  key: forge.pki.rsa.PrivateKey
}> => {
  const forge = await importNodeForge()
  const [certPem, keyPem] = await Promise.all([
    readFile(getCaCertPath(), 'utf-8'),
    readFile(getCaKeyPath(), 'utf-8'),
  ])
  return {
    cert: forge.pki.certificateFromPem(certPem),
    key: forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey,
  }
}

/**
 * Generate a new self-signed CA certificate with an RSA 2048 key pair.
 * Valid for 10 years with basicConstraints CA:true.
 */
export const generateCaCert = async (): Promise<{
  cert: forge.pki.Certificate
  key: forge.pki.rsa.PrivateKey
  certPem: string
  keyPem: string
}> => {
  const forge = await importNodeForge()
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = await generateSerialNumber()

  const now = new Date()
  cert.validity.notBefore = now
  cert.validity.notAfter = new Date(
    now.getFullYear() + 10,
    now.getMonth(),
    now.getDate(),
  )

  const attrs = [
    { name: 'organizationName', value: 'denvig.com' },
    { name: 'commonName', value: 'Denvig Local CA' },
  ]
  cert.setSubject(attrs)
  cert.setIssuer(attrs)

  cert.setExtensions([
    { name: 'basicConstraints', cA: true, critical: true },
    {
      name: 'keyUsage',
      keyCertSign: true,
      cRLSign: true,
      critical: true,
    },
  ])

  cert.sign(keys.privateKey, forge.md.sha256.create())

  return {
    cert,
    key: keys.privateKey,
    certPem: forge.pki.certificateToPem(cert),
    keyPem: forge.pki.privateKeyToPem(keys.privateKey),
  }
}

/**
 * Generate a domain certificate signed by the given CA.
 * Returns PEM-encoded private key and fullchain (domain cert + CA cert).
 */
export const generateDomainCert = async (
  domain: string,
  caCert: forge.pki.Certificate,
  caKey: forge.pki.rsa.PrivateKey,
): Promise<{ privkey: string; fullchain: string }> => {
  const forge = await importNodeForge()
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = await generateSerialNumber()

  const now = new Date()
  cert.validity.notBefore = now
  cert.validity.notAfter = new Date(now.getTime() + 720 * 24 * 60 * 60 * 1000)

  cert.setSubject([{ name: 'commonName', value: domain }])
  cert.setIssuer(caCert.subject.attributes)

  cert.setExtensions([
    { name: 'basicConstraints', cA: false },
    {
      name: 'keyUsage',
      digitalSignature: true,
      keyEncipherment: true,
      critical: true,
    },
    {
      name: 'extKeyUsage',
      serverAuth: true,
    },
    {
      name: 'subjectAltName',
      altNames: [{ type: 2, value: domain }],
    },
  ])

  cert.sign(caKey, forge.md.sha256.create())

  const certPem = forge.pki.certificateToPem(cert)
  const caCertPem = forge.pki.certificateToPem(caCert)

  return {
    privkey: forge.pki.privateKeyToPem(keys.privateKey),
    fullchain: certPem + caCertPem,
  }
}

/**
 * Install the CA certificate into the macOS system keychain.
 * Requires sudo for write access to the System keychain.
 */
export const installCaToKeychain = (caCertPath: string): void => {
  execSync(
    `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${caCertPath}`,
    { stdio: 'inherit' },
  )
}

/**
 * Remove the CA certificate from the macOS system keychain.
 * Requires sudo for write access to the System keychain.
 */
export const uninstallCaFromKeychain = (caCertPath: string): void => {
  execSync(`sudo security remove-trusted-cert -d ${caCertPath}`, {
    stdio: 'inherit',
  })
}

/**
 * Extract the first PEM certificate from a fullchain bundle.
 */
const extractFirstCert = (pem: string): string => {
  const match = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/,
  )
  return match ? match[0] : pem
}

/**
 * Extract domain names from a certificate's SAN extension.
 * Falls back to the CN field if no SAN DNS entries are found.
 */
export const parseCertDomains = (certPem: string): string[] => {
  const cert = new X509Certificate(extractFirstCert(certPem))
  const domains: string[] = []

  // Check SAN extension first (format: "DNS:example.com, DNS:*.example.com")
  const san = cert.subjectAltName
  if (san) {
    for (const entry of san.split(',')) {
      const trimmed = entry.trim()
      if (trimmed.startsWith('DNS:')) {
        domains.push(trimmed.slice(4))
      }
    }
  }

  // Fall back to CN if no SAN domains found
  if (domains.length === 0) {
    const cnMatch = cert.subject.match(/CN=([^,\n]+)/)
    if (cnMatch) {
      domains.push(cnMatch[1])
    }
  }

  return domains
}

/**
 * Extract the expiry date from a PEM certificate.
 */
export const getCertExpiry = (certPem: string): Date => {
  const cert = new X509Certificate(extractFirstCert(certPem))
  return new Date(cert.validTo)
}

/**
 * Write CA files to disk, creating directories as needed.
 * The private key is written with mode 0600.
 */
export const writeCaFiles = async (
  certPem: string,
  keyPem: string,
): Promise<void> => {
  const caDir = getCaDir()
  await mkdir(caDir, { recursive: true })
  await Promise.all([
    writeFile(getCaKeyPath(), keyPem, { mode: 0o600 }),
    writeFile(getCaCertPath(), certPem),
  ])
}

/**
 * Write domain cert files to disk, creating directories as needed.
 * The private key is written with mode 0600.
 */
export const writeDomainCertFiles = async (
  domain: string,
  privkey: string,
  fullchain: string,
): Promise<string> => {
  const certDir = getCertDir(domain)
  await mkdir(certDir, { recursive: true })
  await Promise.all([
    writeFile(resolve(certDir, 'privkey.pem'), privkey, { mode: 0o600 }),
    writeFile(resolve(certDir, 'fullchain.pem'), fullchain),
  ])
  return certDir
}

/**
 * Check if the CA has been initialized by verifying both
 * the certificate and key files exist on disk.
 */
export const isCaInitialized = async (): Promise<boolean> => {
  const [certExists, keyExists] = await Promise.all([
    pathExists(getCaCertPath()),
    pathExists(getCaKeyPath()),
  ])
  return certExists && keyExists
}

/**
 * Check if the local CA certificate is trusted in the macOS system keychain.
 * Returns false if CA files don't exist or if the cert fails verification.
 */
export const isCaTrustedInKeychain = async (): Promise<boolean> => {
  const caCertPath = getCaCertPath()
  if (!(await pathExists(caCertPath))) return false
  const result = spawnSync('security', ['verify-cert', '-c', caCertPath], {
    stdio: 'pipe',
  })
  return result.status === 0
}

/**
 * Check if a certificate was issued by the given CA certificate.
 * Uses cryptographic signature verification, not just issuer name matching.
 * Handles fullchain bundles by extracting the first cert.
 */
export const isCertIssuedBy = (certPem: string, caCertPem: string): boolean => {
  try {
    const cert = new X509Certificate(extractFirstCert(certPem))
    const caCert = new X509Certificate(extractFirstCert(caCertPem))
    return cert.checkIssued(caCert) && cert.verify(caCert.publicKey)
  } catch {
    return false
  }
}

/**
 * Check if a certificate's issuer matches the Denvig Local CA distinguished name.
 * This works even when the CA files have been deleted from disk.
 */
export const isIssuedByLocalCa = (certPem: string): boolean => {
  try {
    const cert = new X509Certificate(extractFirstCert(certPem))
    return (
      cert.issuer.includes('CN=Denvig Local CA') &&
      cert.issuer.includes('O=denvig.com')
    )
  } catch {
    return false
  }
}

/**
 * Extract the issuer's Common Name from a PEM certificate.
 * Returns null if the CN cannot be extracted.
 */
export const getCertIssuerCN = (certPem: string): string | null => {
  try {
    const cert = new X509Certificate(extractFirstCert(certPem))
    const match = cert.issuer.match(/CN=([^,\n]+)/)
    return match ? match[1] : null
  } catch {
    return null
  }
}

/**
 * Generate a random serial number for certificates.
 */
const generateSerialNumber = async (): Promise<string> => {
  const forge = await importNodeForge()
  return forge.util.bytesToHex(forge.random.getBytesSync(16))
}
