import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { generateNginxConfig, getNginxConfigPath } from './nginx.ts'

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
  })

  describe('getNginxConfigPath()', () => {
    it('should return correct path format', () => {
      const path = getNginxConfigPath(
        'abc123',
        'api',
        '/opt/homebrew/etc/nginx/servers',
      )

      strictEqual(
        path,
        '/opt/homebrew/etc/nginx/servers/denvig.abc123.api.conf',
      )
    })

    it('should handle service names with hyphens', () => {
      const path = getNginxConfigPath(
        'abc123',
        'my-service',
        '/opt/homebrew/etc/nginx/servers',
      )

      strictEqual(
        path,
        '/opt/homebrew/etc/nginx/servers/denvig.abc123.my-service.conf',
      )
    })
  })
})
