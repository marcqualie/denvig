import { exec } from 'node:child_process'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { promisify } from 'node:util'

import { getGatewayHtmlDir } from './html.ts'

const execAsync = promisify(exec)

export type NginxConfigOptions = {
  projectId: string
  projectPath: string
  projectSlug: string
  serviceName: string
  port: number
  domain: string
  cnames?: string[]
  sslCertPath?: string
  sslKeyPath?: string
  /** Stable log file for the service, surfaced as a comment for debugging. */
  logPath?: string
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
    sslCertPath,
    sslKeyPath,
    logPath,
  } = options

  const upstreamName = `denvig-${projectId}--${serviceName}`

  // Combine domain and cnames for server_name
  const allDomains = [domain, ...(cnames || [])].join(' ')

  const hasSsl = !!(sslCertPath && sslKeyPath)

  const sslBlock = hasSsl
    ? `
  ssl_certificate ${sslCertPath};
  ssl_certificate_key ${sslKeyPath};
  ssl_protocols TLSv1.2 TLSv1.3;
  ssl_ciphers HIGH:!aNULL:!MD5;`
    : ''

  const listenBlock = hasSsl
    ? `  listen 80;
  listen 443 ssl;
  http2 on;`
    : `  listen 80;`

  const htmlDir = getGatewayHtmlDir()

  const logComment = logPath ? `\n# log: ${logPath}` : ''

  return `# denvig:
# slug: ${projectSlug}
# path: ${projectPath}
# service: ${serviceName}
# domain: ${allDomains}
# port: ${port}${logComment}
upstream ${upstreamName} { server 127.0.0.1:${port} max_fails=0 fail_timeout=30; }
server {
${listenBlock}
  server_name ${allDomains};
  root ${projectPath}/public;
  index index.html;
  client_max_body_size 100M;
${sslBlock}

  error_page 502 503 504 /denvig-errors/504.html;
  location /denvig-errors/ {
    alias ${htmlDir}/errors/;
    internal;
  }

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
 * Generate the main nginx.conf content.
 * Includes a default server with the denvig landing page and error pages,
 * plus an include directive for service configs in the servers directory.
 */
export function generateNginxMainConfig(configsPath: string): string {
  const htmlDir = getGatewayHtmlDir()
  const nginxDir = resolve(configsPath, '..')

  return `# Managed by denvig — do not edit manually
# https://denvig.com

worker_processes 4;

events {
  worker_connections 1024;
}

http {
  include ${nginxDir}/mime.types;
  default_type application/octet-stream;

  sendfile on;
  keepalive_timeout 65;

  server {
    listen 80 default_server;
    server_name _;

    root ${htmlDir};
    index index.html;

    error_page 404 /errors/404.html;
  }

  include ${getDenvigNginxConfPath()};
}
`
}

/**
 * Write the main nginx.conf file.
 */
export async function writeNginxMainConfig(
  configsPath: string,
): Promise<{ success: boolean; message?: string }> {
  try {
    const confPath = getNginxConfPath(configsPath)
    const content = generateNginxMainConfig(configsPath)
    await writeFile(confPath, content, 'utf-8')
    return { success: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return {
      success: false,
      message: `Failed to write nginx.conf: ${message}`,
    }
  }
}

/**
 * Path to the single denvig nginx config that holds every service's server
 * block. The main nginx.conf includes this file. Keeping everything in one
 * place (rather than one hashed file per service) makes the running gateway
 * easy to inspect and debug.
 */
export function getDenvigNginxConfPath(): string {
  return resolve(homedir(), '.denvig', 'nginx.conf')
}

/**
 * Generate the combined denvig nginx config containing one server block per
 * service, sorted alphabetically by primary domain so the file is stable and
 * easy to scan.
 */
export function generateDenvigNginxConfig(
  services: NginxConfigOptions[],
): string {
  const sorted = [...services].sort((a, b) => a.domain.localeCompare(b.domain))
  const header =
    '# Managed by denvig — do not edit manually\n# https://denvig.com\n'
  if (sorted.length === 0) {
    return `${header}`
  }
  const blocks = sorted.map((service) => generateNginxConfig(service))
  return `${header}\n${blocks.join('\n')}`
}

/**
 * Write the single combined denvig nginx config file.
 */
export async function writeDenvigNginxConfig(
  services: NginxConfigOptions[],
): Promise<{ success: boolean; message?: string }> {
  try {
    const confPath = getDenvigNginxConfPath()
    await mkdir(dirname(confPath), { recursive: true })
    const content = generateDenvigNginxConfig(services)
    await writeFile(confPath, content, 'utf-8')

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
 * Remove legacy per-service nginx config files from the configs directory.
 * Earlier versions wrote one `denvig.{projectId}.{serviceName}.conf` file per
 * service here; everything now lives in a single combined config instead, so
 * these are cleaned up to avoid stale, double-included server blocks.
 */
export async function removeAllNginxConfigs(
  configsPath: string,
): Promise<{ success: boolean; removed: string[]; message?: string }> {
  try {
    const prefix = 'denvig.'
    const suffix = '.conf'
    let files: string[]
    try {
      files = await readdir(configsPath)
    } catch (error) {
      // A missing servers directory just means there's nothing to clean up.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return { success: true, removed: [] }
      }
      throw error
    }
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
