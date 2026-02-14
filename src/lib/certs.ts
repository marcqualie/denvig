import { execSync } from 'node:child_process'
import { X509Certificate } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import forge from 'node-forge'

const HOME = process.env.HOME || ''

/** Directory containing the CA key and certificate */
export const getCaDir = (): string => resolve(`${HOME}/.denvig/ca`)

/** Directory containing all domain certificate directories */
export const getCertsDir = (): string => resolve(`${HOME}/.denvig/certs`)

/** Path to the CA private key */
export const getCaKeyPath = (): string => resolve(getCaDir(), 'rootCA-key.pem')

/** Path to the CA certificate */
export const getCaCertPath = (): string => resolve(getCaDir(), 'rootCA.pem')

/** Directory for a specific domain's certificates */
export const getCertDir = (domain: string): string => {
  const dirName = domain.replace(/^\*/, '_wildcard')
  return resolve(getCertsDir(), dirName)
}

/** Load the CA certificate and private key from disk */
export const loadCaCert = (): {
  cert: forge.pki.Certificate
  key: forge.pki.rsa.PrivateKey
} => {
  const certPem = readFileSync(getCaCertPath(), 'utf-8')
  const keyPem = readFileSync(getCaKeyPath(), 'utf-8')
  return {
    cert: forge.pki.certificateFromPem(certPem),
    key: forge.pki.privateKeyFromPem(keyPem) as forge.pki.rsa.PrivateKey,
  }
}

/** Generate a new CA certificate and RSA 2048 key pair */
export const generateCaCert = (): {
  cert: forge.pki.Certificate
  key: forge.pki.rsa.PrivateKey
  certPem: string
  keyPem: string
} => {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = generateSerialNumber()

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
 * Generate a domain certificate signed by the given CA
 */
export const generateDomainCert = (
  domain: string,
  caCert: forge.pki.Certificate,
  caKey: forge.pki.rsa.PrivateKey,
): { privkey: string; fullchain: string } => {
  const keys = forge.pki.rsa.generateKeyPair(2048)
  const cert = forge.pki.createCertificate()

  cert.publicKey = keys.publicKey
  cert.serialNumber = generateSerialNumber()

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

/** Install the CA certificate into the macOS system keychain */
export const installCaToKeychain = (caCertPath: string): void => {
  execSync(
    `sudo security add-trusted-cert -d -r trustRoot -k /Library/Keychains/System.keychain ${caCertPath}`,
    { stdio: 'inherit' },
  )
}

/** Extract the first PEM certificate from a fullchain bundle */
const extractFirstCert = (pem: string): string => {
  const match = pem.match(
    /-----BEGIN CERTIFICATE-----[\s\S]*?-----END CERTIFICATE-----/,
  )
  return match ? match[0] : pem
}

/** Extract domain names from a certificate's SAN and CN */
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

/** Extract the expiry date from a PEM certificate */
export const getCertExpiry = (certPem: string): Date => {
  const cert = new X509Certificate(extractFirstCert(certPem))
  return new Date(cert.validTo)
}

/** Write CA files to disk, creating directories as needed */
export const writeCaFiles = (certPem: string, keyPem: string): void => {
  const caDir = getCaDir()
  mkdirSync(caDir, { recursive: true })
  writeFileSync(getCaKeyPath(), keyPem, { mode: 0o600 })
  writeFileSync(getCaCertPath(), certPem)
}

/** Write domain cert files to disk, creating directories as needed */
export const writeDomainCertFiles = (
  domain: string,
  privkey: string,
  fullchain: string,
): string => {
  const certDir = getCertDir(domain)
  mkdirSync(certDir, { recursive: true })
  writeFileSync(resolve(certDir, 'privkey.pem'), privkey, { mode: 0o600 })
  writeFileSync(resolve(certDir, 'fullchain.pem'), fullchain)
  return certDir
}

/** Check if the CA has been initialized */
export const isCaInitialized = (): boolean => {
  return existsSync(getCaCertPath()) && existsSync(getCaKeyPath())
}

/** Generate a random serial number for certificates */
const generateSerialNumber = (): string => {
  return forge.util.bytesToHex(forge.random.getBytesSync(16))
}
