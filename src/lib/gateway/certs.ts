import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  generateDomainCert,
  getCertDir,
  getCertsDir,
  isCaInitialized,
  loadCaCert,
  parseCertDomains,
  writeDomainCertFiles,
} from '../certs.ts'

/**
 * Check if a domain matches a cert domain (exact or wildcard).
 * `*.example.com` matches `api.example.com` but not `example.com` or `a.b.example.com`.
 */
function domainMatchesCert(domain: string, certDomain: string): boolean {
  if (domain === certDomain) return true
  if (
    certDomain.startsWith('*.') &&
    domain.endsWith(certDomain.slice(1)) &&
    !domain.slice(0, -certDomain.length + 1).includes('.')
  ) {
    return true
  }
  return false
}

/**
 * Find an existing cert directory that covers the given domain.
 * Scans all cert directories in `~/.denvig/certs/`, reads each `fullchain.pem`,
 * and checks for an exact or wildcard match.
 * @returns The cert directory path if found, null otherwise.
 */
export function findCertForDomain(domain: string): string | null {
  const certsDir = getCertsDir()
  if (!existsSync(certsDir)) return null

  let entries: string[]
  try {
    entries = readdirSync(certsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
  } catch {
    return null
  }

  for (const entry of entries) {
    const certPath = resolve(certsDir, entry, 'fullchain.pem')
    if (!existsSync(certPath)) continue

    try {
      const certPem = readFileSync(certPath, 'utf-8')
      const domains = parseCertDomains(certPem)
      if (domains.some((certDomain) => domainMatchesCert(domain, certDomain))) {
        return resolve(certsDir, entry)
      }
    } catch {}
  }

  return null
}

/**
 * Extract the parent domain from a domain name.
 * `api.marcqualie.dev` → `marcqualie.dev`
 * `denvig.localhost` → `denvig.localhost` (2-part domains stay as-is)
 */
export function getParentDomain(domain: string): string {
  const parts = domain.split('.')
  if (parts.length <= 2) return domain
  return parts.slice(1).join('.')
}

/**
 * Group domains by parent domain for cert generation.
 * If 2+ subdomains share a parent, the key is `*.parent.tld` (wildcard cert).
 * Single subdomain or bare domain uses the domain itself as the key.
 * @returns Map from cert domain (possibly wildcard) to list of covered domains.
 */
export function groupDomainsForCertGeneration(
  domains: string[],
): Map<string, string[]> {
  const parentMap = new Map<string, string[]>()

  for (const domain of domains) {
    const parent = getParentDomain(domain)
    if (!parentMap.has(parent)) {
      parentMap.set(parent, [])
    }
    parentMap.get(parent)!.push(domain)
  }

  const result = new Map<string, string[]>()
  for (const [parent, children] of parentMap) {
    // If parent === child, it's a bare domain (e.g. denvig.localhost)
    const hasSubdomains = children.some((d) => d !== parent)
    if (hasSubdomains && children.length >= 2) {
      result.set(`*.${parent}`, children)
    } else {
      for (const child of children) {
        result.set(child, [child])
      }
    }
  }

  return result
}

/**
 * Generate missing certs for a list of domains.
 * Checks existing certs first via `findCertForDomain`, then groups uncovered
 * domains by parent and generates wildcard certs where appropriate.
 * @returns Map from domain to cert directory path.
 */
export async function generateMissingCerts(
  domains: string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>()
  const uncovered: string[] = []

  for (const domain of domains) {
    const existing = findCertForDomain(domain)
    if (existing) {
      result.set(domain, existing)
    } else {
      uncovered.push(domain)
    }
  }

  if (uncovered.length === 0) return result
  if (!isCaInitialized()) return result

  const { cert: caCert, key: caKey } = await loadCaCert()
  const groups = groupDomainsForCertGeneration(uncovered)

  for (const [certDomain, coveredDomains] of groups) {
    const { privkey, fullchain } = await generateDomainCert(
      certDomain,
      caCert,
      caKey,
    )
    const certDir = writeDomainCertFiles(certDomain, privkey, fullchain)
    for (const domain of coveredDomains) {
      result.set(domain, certDir)
    }
  }

  return result
}

/**
 * Resolve SSL cert and key paths for a domain from a cert directory.
 */
export function resolveSslPaths(
  certDir: string,
): { sslCertPath: string; sslKeyPath: string } | null {
  const sslCertPath = resolve(certDir, 'fullchain.pem')
  const sslKeyPath = resolve(certDir, 'privkey.pem')
  if (existsSync(sslCertPath) && existsSync(sslKeyPath)) {
    return { sslCertPath, sslKeyPath }
  }
  return null
}
