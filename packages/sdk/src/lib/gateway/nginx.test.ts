import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import {
  generateDenvigNginxConfig,
  generateNginxConfig,
  getDenvigNginxConfPath,
} from './nginx.ts'

describe('nginx gateway', () => {
  describe('generateNginxConfig()', () => {
    it('should generate basic config without SSL', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
      })

      // Check header comments
      ok(config.includes('# denvig:'))
      ok(config.includes('# slug: test/project'))
      ok(config.includes('# path: /Users/test/project'))
      ok(config.includes('# service: api'))

      // Check upstream
      ok(config.includes('upstream denvig-abc123--api'))
      ok(config.includes('server 127.0.0.1:3000'))

      // Check server block
      ok(config.includes('listen 80;'))
      ok(config.includes('server_name api.denvig.localhost'))
      ok(config.includes('proxy_pass http://denvig-abc123--api'))

      // Should NOT have SSL directives
      ok(!config.includes('listen 443'))
      ok(!config.includes('ssl_certificate'))
    })

    it('should include SSL when sslCertPath and sslKeyPath are provided', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        sslCertPath:
          '/home/user/.denvig/certs/api.denvig.localhost/fullchain.pem',
        sslKeyPath: '/home/user/.denvig/certs/api.denvig.localhost/privkey.pem',
      })

      ok(config.includes('listen 443 ssl'))
      ok(
        config.includes(
          'ssl_certificate /home/user/.denvig/certs/api.denvig.localhost/fullchain.pem',
        ),
      )
      ok(
        config.includes(
          'ssl_certificate_key /home/user/.denvig/certs/api.denvig.localhost/privkey.pem',
        ),
      )
      ok(config.includes('http2 on'))
    })

    it('should not include SSL when only sslCertPath is provided', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        sslCertPath: '/some/path/fullchain.pem',
      })

      ok(!config.includes('listen 443'))
      ok(!config.includes('ssl_certificate'))
    })

    it('should not include SSL when neither ssl path is provided', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
      })

      ok(!config.includes('listen 443'))
      ok(!config.includes('ssl_certificate'))
    })

    it('should include WebSocket support headers', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
      })

      ok(config.includes('proxy_http_version 1.1'))
      ok(config.includes('proxy_set_header Upgrade $http_upgrade'))
      ok(config.includes('proxy_set_header Connection "upgrade"'))
    })

    it('should include proxy headers', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
      })

      ok(config.includes('proxy_set_header Host $host'))
      ok(config.includes('proxy_set_header X-Forwarded-Host $host'))
      ok(
        config.includes(
          'proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for',
        ),
      )
      ok(config.includes('proxy_redirect off'))
      ok(config.includes('proxy_buffering off'))
    })

    it('should include cnames in server_name directive', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        cnames: ['api2.denvig.localhost', 'api3.denvig.localhost'],
      })

      // server_name should include domain and all cnames
      ok(
        config.includes(
          'server_name api.denvig.localhost api2.denvig.localhost api3.denvig.localhost',
        ),
      )
    })

    it('should include the log location comment when provided', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        logPath: '/Users/test/.denvig/services/abc123.api/logs/latest.log',
      })

      ok(
        config.includes(
          '# log: /Users/test/.denvig/services/abc123.api/logs/latest.log',
        ),
      )
    })

    it('should omit the log comment when no logPath is provided', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
      })

      ok(!config.includes('# log:'))
    })
  })

  describe('getDenvigNginxConfPath()', () => {
    it('should resolve to ~/.denvig/nginx.conf', () => {
      ok(getDenvigNginxConfPath().endsWith('/.denvig/nginx.conf'))
    })
  })

  describe('generateDenvigNginxConfig()', () => {
    const base = {
      projectId: 'abc123',
      projectPath: '/Users/test/project',
      projectSlug: 'test/project',
      port: 3000,
    }

    it('should sort server blocks alphabetically by domain', () => {
      const config = generateDenvigNginxConfig([
        { ...base, serviceName: 'web', domain: 'web.denvig.localhost' },
        { ...base, serviceName: 'api', domain: 'api.denvig.localhost' },
      ])

      const apiIndex = config.indexOf('# service: api')
      const webIndex = config.indexOf('# service: web')
      ok(apiIndex !== -1 && webIndex !== -1)
      ok(apiIndex < webIndex, 'api block should come before web block')
    })

    it('should include a managed-by-denvig header', () => {
      const config = generateDenvigNginxConfig([])

      ok(config.includes('# Managed by denvig — do not edit manually'))
    })

    it('should contain every service block', () => {
      const config = generateDenvigNginxConfig([
        { ...base, serviceName: 'api', domain: 'api.denvig.localhost' },
        { ...base, serviceName: 'web', domain: 'web.denvig.localhost' },
      ])

      ok(config.includes('upstream denvig-abc123--api'))
      ok(config.includes('upstream denvig-abc123--web'))
    })
  })
})
