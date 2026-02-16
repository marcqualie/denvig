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

    it('should generate config with SSL when secure is true', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        secure: true,
        certPath: 'certs/fullchain.pem',
        keyPath: 'certs/privkey.pem',
      })

      // Check SSL directives
      ok(config.includes('listen 443 ssl'))
      ok(config.includes('http2 on'))
      ok(
        config.includes(
          'ssl_certificate /Users/test/project/certs/fullchain.pem',
        ),
      )
      ok(
        config.includes(
          'ssl_certificate_key /Users/test/project/certs/privkey.pem',
        ),
      )
      ok(config.includes('ssl_protocols TLSv1.2 TLSv1.3'))
    })

    it('should generate config with SSL when cert paths are provided', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        certPath: 'certs/fullchain.pem',
        keyPath: 'certs/privkey.pem',
      })

      // Should have SSL directives even without secure: true
      ok(config.includes('listen 443 ssl'))
      ok(config.includes('ssl_certificate'))
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

    it('should resolve relative cert paths to absolute paths', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        secure: true,
        certPath: 'certs/fullchain.pem',
        keyPath: 'certs/privkey.pem',
      })

      // Paths should be absolute
      ok(
        config.includes(
          'ssl_certificate /Users/test/project/certs/fullchain.pem',
        ),
      )
      ok(
        config.includes(
          'ssl_certificate_key /Users/test/project/certs/privkey.pem',
        ),
      )
    })

    it('should resolve "auto" cert paths to ~/.denvig/certs/{domain}/', () => {
      const config = generateNginxConfig({
        projectId: 'abc123',
        projectPath: '/Users/test/project',
        projectSlug: 'test/project',
        serviceName: 'api',
        port: 3000,
        domain: 'api.denvig.localhost',
        secure: true,
        certPath: 'auto',
        keyPath: 'auto',
      })

      // Paths should resolve to ~/.denvig/certs/{domain}/
      ok(config.includes('.denvig/certs/api.denvig.localhost/fullchain.pem'))
      ok(config.includes('.denvig/certs/api.denvig.localhost/privkey.pem'))
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
