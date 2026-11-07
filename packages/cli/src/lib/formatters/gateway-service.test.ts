import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { formatGatewayService } from './gateway-service.ts'

const view = {
  projectSlug: 'github:owner/repo',
  serviceName: 'web',
  domains: ['web.denvig.localhost'],
  port: 5173,
  certStatus: 'not_configured' as const,
  nginxOk: true,
  nginxLabel: 'configured',
}

describe('formatGatewayService()', () => {
  it('shows the upstream host and port the domain proxies to', () => {
    const output = formatGatewayService({ ...view, host: '127.0.0.1' })
    ok(output.includes('web.denvig.localhost -> 127.0.0.1:5173'))
  })

  it('brackets an IPv6 upstream host', () => {
    const output = formatGatewayService({ ...view, host: '::1' })
    ok(output.includes('web.denvig.localhost -> [::1]:5173'))
  })
})
