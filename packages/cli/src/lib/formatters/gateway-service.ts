/** Normalized view of one gateway service, rendered the same everywhere. */
export type GatewayServiceView = {
  projectSlug: string
  serviceName: string
  /** Primary domain first, then any cnames. */
  domains: string[]
  port: number
  certStatus: 'valid' | 'missing' | 'not_configured'
  certDir?: string | null
  certMessage?: string
  /** Whether the service's server block is present in / written to nginx. */
  nginxOk: boolean
  /** Short nginx state label, e.g. `configured`, `missing`, `error`. */
  nginxLabel: string
  nginxMessage?: string
}

const certIcon = (status: GatewayServiceView['certStatus']): string =>
  status === 'valid' ? '✓' : status === 'missing' ? '✗' : '-'

/**
 * Render a gateway service as an indented block. Shared by `gateway status`
 * and `gateway configure` so both commands present the data identically:
 *
 * ```
 *   slug/service
 *     Domains: a.localhost, b.localhost -> localhost:3000
 *     Certs:   ✓ valid (wildcard)
 *     Nginx:   ✓ configured
 * ```
 */
export const formatGatewayService = (view: GatewayServiceView): string => {
  const certDetail =
    view.certStatus === 'valid' && view.certDir
      ? ` (${view.certDir.split('/').pop()})`
      : view.certStatus === 'missing' && view.certMessage
        ? ` (${view.certMessage})`
        : ''
  const nginxMessage = view.nginxMessage ? ` (${view.nginxMessage})` : ''

  return [
    `  ${view.projectSlug}/${view.serviceName}`,
    `    Domains: ${view.domains.join(', ')} -> localhost:${view.port}`,
    `    Certs:   ${certIcon(view.certStatus)} ${view.certStatus}${certDetail}`,
    `    Nginx:   ${view.nginxOk ? '✓' : '✗'} ${view.nginxLabel}${nginxMessage}`,
  ].join('\n')
}
