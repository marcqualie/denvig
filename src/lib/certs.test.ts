import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { X509Certificate } from 'node:crypto'
import { describe, it } from 'node:test'
import forge from 'node-forge'

import {
  generateCaCert,
  generateDomainCert,
  getCaCertPath,
  getCaDir,
  getCaKeyPath,
  getCertDir,
  getCertExpiry,
  getCertsDir,
  parseCertDomains,
} from './certs.ts'

describe('getCaDir()', () => {
  it('returns path under ~/.denvig/ca', () => {
    ok(getCaDir().endsWith('/.denvig/ca'))
  })
})

describe('getCertsDir()', () => {
  it('returns path under ~/.denvig/certs', () => {
    ok(getCertsDir().endsWith('/.denvig/certs'))
  })
})

describe('getCaKeyPath()', () => {
  it('returns rootCA-key.pem inside CA dir', () => {
    ok(getCaKeyPath().endsWith('/.denvig/ca/rootCA-key.pem'))
  })
})

describe('getCaCertPath()', () => {
  it('returns rootCA.pem inside CA dir', () => {
    ok(getCaCertPath().endsWith('/.denvig/ca/rootCA.pem'))
  })
})

describe('getCertDir()', () => {
  it('returns domain directory under certs dir', () => {
    const dir = getCertDir('example.com')
    ok(dir.endsWith('/.denvig/certs/example.com'))
  })

  it('replaces wildcard * with _wildcard', () => {
    const dir = getCertDir('*.example.com')
    ok(dir.endsWith('/.denvig/certs/_wildcard.example.com'))
  })

  it('only replaces leading wildcard', () => {
    const dir = getCertDir('sub.*.example.com')
    ok(dir.endsWith('/.denvig/certs/sub.*.example.com'))
  })
})

describe('generateCaCert()', () => {
  const ca = generateCaCert()

  it('returns PEM-encoded certificate', () => {
    ok(ca.certPem.startsWith('-----BEGIN CERTIFICATE-----'))
    ok(ca.certPem.trimEnd().endsWith('-----END CERTIFICATE-----'))
  })

  it('returns PEM-encoded private key', () => {
    ok(ca.keyPem.startsWith('-----BEGIN RSA PRIVATE KEY-----'))
    ok(ca.keyPem.trimEnd().endsWith('-----END RSA PRIVATE KEY-----'))
  })

  it('sets organization to denvig.com', () => {
    const org = ca.cert.subject.getField('O')
    strictEqual(org?.value, 'denvig.com')
  })

  it('sets common name to Denvig Local CA', () => {
    const cn = ca.cert.subject.getField('CN')
    strictEqual(cn?.value, 'Denvig Local CA')
  })

  it('is self-signed (issuer matches subject)', () => {
    const subjectCN = ca.cert.subject.getField('CN')?.value
    const issuerCN = ca.cert.issuer.getField('CN')?.value
    strictEqual(subjectCN, issuerCN)
  })

  it('has basicConstraints with CA:true', () => {
    const ext = ca.cert.getExtension('basicConstraints') as
      | { cA?: boolean }
      | undefined
    strictEqual(ext?.cA, true)
  })

  it('has keyUsage with keyCertSign', () => {
    const ext = ca.cert.getExtension('keyUsage') as
      | { keyCertSign?: boolean }
      | undefined
    strictEqual(ext?.keyCertSign, true)
  })

  it('is valid for approximately 10 years', () => {
    const notBefore = ca.cert.validity.notBefore
    const notAfter = ca.cert.validity.notAfter
    const years =
      (notAfter.getTime() - notBefore.getTime()) /
      (365.25 * 24 * 60 * 60 * 1000)
    ok(years >= 9.9 && years <= 10.1, `Expected ~10 years, got ${years}`)
  })

  it('can be parsed by Node crypto', () => {
    const x509 = new X509Certificate(ca.certPem)
    ok(x509.subject.includes('CN=Denvig Local CA'))
  })
})

describe('generateDomainCert()', () => {
  const ca = generateCaCert()
  const result = generateDomainCert('test.example.com', ca.cert, ca.key)

  it('returns PEM-encoded private key', () => {
    ok(result.privkey.startsWith('-----BEGIN RSA PRIVATE KEY-----'))
  })

  it('returns fullchain with two certificates', () => {
    const certs = result.fullchain.match(/-----BEGIN CERTIFICATE-----/g)
    strictEqual(certs?.length, 2)
  })

  it('sets the domain as CN', () => {
    const x509 = new X509Certificate(result.fullchain)
    ok(x509.subject.includes('CN=test.example.com'))
  })

  it('includes the domain in SAN', () => {
    const x509 = new X509Certificate(result.fullchain)
    ok(x509.subjectAltName?.includes('DNS:test.example.com'))
  })

  it('is signed by the CA (issuer matches CA subject)', () => {
    const x509 = new X509Certificate(result.fullchain)
    const caX509 = new X509Certificate(ca.certPem)
    ok(x509.issuer.includes('CN=Denvig Local CA'))
    ok(x509.checkIssued(caX509))
  })

  it('has basicConstraints CA:false', () => {
    const cert = forge.pki.certificateFromPem(result.fullchain)
    const ext = cert.getExtension('basicConstraints') as
      | { cA?: boolean }
      | undefined
    strictEqual(ext?.cA, false)
  })

  it('supports wildcard domains', () => {
    const wildcard = generateDomainCert('*.example.com', ca.cert, ca.key)
    const x509 = new X509Certificate(wildcard.fullchain)
    ok(x509.subjectAltName?.includes('DNS:*.example.com'))
    ok(x509.subject.includes('CN=*.example.com'))
  })
})

describe('parseCertDomains()', () => {
  const ca = generateCaCert()

  it('extracts domain from SAN', () => {
    const { fullchain } = generateDomainCert('app.example.com', ca.cert, ca.key)
    const domains = parseCertDomains(fullchain)
    deepStrictEqual(domains, ['app.example.com'])
  })

  it('extracts wildcard domain from SAN', () => {
    const { fullchain } = generateDomainCert('*.example.com', ca.cert, ca.key)
    const domains = parseCertDomains(fullchain)
    deepStrictEqual(domains, ['*.example.com'])
  })

  it('falls back to CN when no SAN is present', () => {
    // Create a cert without SAN extension
    const keys = forge.pki.rsa.generateKeyPair(2048)
    const cert = forge.pki.createCertificate()
    cert.publicKey = keys.publicKey
    cert.serialNumber = '01'
    cert.validity.notBefore = new Date()
    cert.validity.notAfter = new Date(Date.now() + 86400000)
    cert.setSubject([{ name: 'commonName', value: 'fallback.example.com' }])
    cert.setIssuer(ca.cert.subject.attributes)
    cert.sign(ca.key, forge.md.sha256.create())
    const pem = forge.pki.certificateToPem(cert)

    const domains = parseCertDomains(pem)
    deepStrictEqual(domains, ['fallback.example.com'])
  })

  it('extracts only the first cert from a fullchain', () => {
    const { fullchain } = generateDomainCert(
      'first.example.com',
      ca.cert,
      ca.key,
    )
    const domains = parseCertDomains(fullchain)
    // Should get domains from the domain cert, not the CA cert
    deepStrictEqual(domains, ['first.example.com'])
  })
})

describe('getCertExpiry()', () => {
  const ca = generateCaCert()

  it('returns a Date in the future for a valid cert', () => {
    const { fullchain } = generateDomainCert(
      'expiry.example.com',
      ca.cert,
      ca.key,
    )
    const expiry = getCertExpiry(fullchain)
    ok(expiry instanceof Date)
    ok(expiry > new Date())
  })

  it('returns expiry from the first cert in fullchain', () => {
    const { fullchain } = generateDomainCert(
      'expiry.example.com',
      ca.cert,
      ca.key,
    )
    const expiry = getCertExpiry(fullchain)
    // Domain cert is ~720 days, CA cert is ~10 years.
    // Should return the domain cert expiry, not the CA.
    const daysUntilExpiry =
      (expiry.getTime() - Date.now()) / (24 * 60 * 60 * 1000)
    ok(daysUntilExpiry < 730, `Expected <730 days, got ${daysUntilExpiry}`)
  })
})
