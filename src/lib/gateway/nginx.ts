import { exec } from 'node:child_process'
import { existsSync } from 'node:fs'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

import { resolveCertPath } from './certs.ts'

const execAsync = promisify(exec)

export type NginxConfigOptions = {
  projectId: string
  projectPath: string
  projectSlug: string
  serviceName: string
  port: number
  domain: string
  cnames?: string[]
  secure?: boolean
  certPath?: string
  keyPath?: string
}

/**
 * Generate nginx config content for a service.
 */
export function generateNginxConfig(options: NginxConfigOptions): string {
  const {
    projectId,
    projectPath,
    projectSlug,
    serviceName,
    port,
    domain,
    cnames,
    secure,
    certPath,
    keyPath,
  } = options

  const upstreamName = `denvig-${projectId}--${serviceName}`

  // Combine domain and cnames for server_name
  const allDomains = [domain, ...(cnames || [])].join(' ')

  // Resolve cert paths (handles 'auto' and relative paths)
  const resolvedCertPath = resolveCertPath(
    certPath,
    domain,
    projectPath,
    'cert',
  )
  const resolvedKeyPath = resolveCertPath(keyPath, domain, projectPath, 'key')
  const hasSsl =
    resolvedCertPath &&
    resolvedKeyPath &&
    existsSync(resolvedCertPath) &&
    existsSync(resolvedKeyPath)

  const sslBlock = hasSsl
    ? `
  ssl_certificate ${resolvedCertPath};
  ssl_certificate_key ${resolvedKeyPath};
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;`
    : ''

  const listenBlock = hasSsl
    ? `  listen 80;
  listen 443 ssl;
  http2 on;`
    : `  listen 80;`

  return `# denvig:
# slug: ${projectSlug}
# path: ${projectPath}
# service: ${serviceName}
upstream ${upstreamName} { server 127.0.0.1:${port} max_fails=0 fail_timeout=30; }
server {
${listenBlock}
  server_name ${allDomains};
  root ${projectPath}/public;
  index index.html;
  client_max_body_size 100M;
${sslBlock}

  location / {
    proxy_pass http://${upstreamName};
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_redirect off;
    proxy_buffering off;

    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
  }
}
`
}

/**
 * Get the main nginx.conf path based on the configsPath.
 * Assumes configsPath is a subdirectory (e.g. servers/) under the nginx config root.
 */
export function getNginxConfPath(configsPath: string): string {
  return resolve(configsPath, '..', 'nginx.conf')
}

/**
 * Get config file path for a service.
 * Format: {configsPath}/denvig.{projectId}.{serviceName}.conf
 */
export function getNginxConfigPath(
  projectId: string,
  serviceName: string,
  configsPath: string,
): string {
  return resolve(configsPath, `denvig.${projectId}.${serviceName}.conf`)
}

/**
 * Write nginx config file for a service.
 */
export async function writeNginxConfig(
  options: NginxConfigOptions,
  configsPath: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const configPath = getNginxConfigPath(
      options.projectId,
      options.serviceName,
      configsPath,
    )

    // Ensure directory exists
    await mkdir(dirname(configPath), { recursive: true })

    const content = generateNginxConfig(options)
    await writeFile(configPath, content, 'utf-8')

    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Failed to write nginx config: ${message}`,
    }
  }
}

/**
 * Remove nginx config file for a service.
 */
export async function removeNginxConfig(
  projectId: string,
  serviceName: string,
  configsPath: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const configPath = getNginxConfigPath(projectId, serviceName, configsPath)
    await rm(configPath, { force: true })
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Failed to remove nginx config: ${message}`,
    }
  }
}

/**
 * Reload nginx configuration.
 */
export async function reloadNginx(): Promise<{
  success: boolean
  message?: string
}> {
  try {
    await execAsync('/opt/homebrew/bin/nginx -s reload')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, message: `Failed to reload nginx: ${message}` }
  }
}

/**
 * Remove all nginx configs for a project.
 */
export async function removeProjectNginxConfigs(
  projectId: string,
  configsPath: string,
  serviceNames: string[],
): Promise<{ success: boolean; message?: string }> {
  try {
    await Promise.all(
      serviceNames.map((serviceName) =>
        removeNginxConfig(projectId, serviceName, configsPath),
      ),
    )
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Failed to remove project nginx configs: ${message}`,
    }
  }
}

/**
 * Remove all denvig-managed nginx config files from the configs directory.
 * Matches any file named denvig.*.conf to catch configs from all projects,
 * including stale configs from renamed/deleted services or projects.
 */
export async function removeAllNginxConfigs(
  configsPath: string,
): Promise<{ success: boolean; removed: string[]; message?: string }> {
  try {
    const prefix = 'denvig.'
    const suffix = '.conf'
    const files = await readdir(configsPath)
    const matched = files.filter(
      (f) => f.startsWith(prefix) && f.endsWith(suffix),
    )

    await Promise.all(
      matched.map((f) => rm(resolve(configsPath, f), { force: true })),
    )

    return { success: true, removed: matched }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      removed: [],
      message: `Failed to remove nginx configs: ${message}`,
    }
  }
}
