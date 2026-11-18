import { equal, ok } from 'node:assert'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import serviceBackend from '../services/backend.ts'
import { generateNginxMainConfig } from './nginx.ts'
import {
  GATEWAY_UNIT_LABEL,
  generateGatewayUnit,
  getDefaultGatewayConfigsPath,
  getUserNginxDir,
  HOMEBREW_GATEWAY_CONFIGS_PATH,
  isUserOwnedNginx,
} from './userNginx.ts'

describe('user-owned nginx gateway', () => {
  const userServers = resolve(homedir(), '.denvig', 'nginx', 'servers')

  describe('getDefaultGatewayConfigsPath()', () => {
    it('uses Homebrew nginx on macOS', (t) => {
      t.mock.method(serviceBackend, 'kind', () => 'launchd')
      equal(getDefaultGatewayConfigsPath(), HOMEBREW_GATEWAY_CONFIGS_PATH)
    })

    it('uses the denvig-managed nginx on Linux', (t) => {
      t.mock.method(serviceBackend, 'kind', () => 'systemd')
      equal(getDefaultGatewayConfigsPath(), userServers)
    })
  })

  describe('isUserOwnedNginx()', () => {
    it('is true for the denvig nginx directory on Linux', (t) => {
      t.mock.method(serviceBackend, 'kind', () => 'systemd')
      ok(isUserOwnedNginx(userServers))
    })

    it('is false for a system nginx path on Linux', (t) => {
      t.mock.method(serviceBackend, 'kind', () => 'systemd')
      ok(!isUserOwnedNginx('/etc/nginx/conf.d'))
    })

    it('is false on macOS even for the denvig directory', (t) => {
      t.mock.method(serviceBackend, 'kind', () => 'launchd')
      ok(!isUserOwnedNginx(userServers))
    })
  })

  describe('generateGatewayUnit()', () => {
    const dir = getUserNginxDir()
    const unit = generateGatewayUnit('/usr/sbin/nginx', dir)
    const conf = resolve(dir, 'nginx.conf')

    it('runs nginx in the foreground against the denvig prefix', () => {
      ok(
        unit.includes(
          `ExecStart="/usr/sbin/nginx" "-e" "stderr" "-p" "${dir}" "-c" "${conf}" "-g" "daemon off;"`,
        ),
      )
    })

    it('validates the config before starting and reloads with HUP', () => {
      ok(unit.includes(`ExecStartPre="/usr/sbin/nginx"`))
      ok(unit.includes('"-t" "-q"'))
      ok(unit.includes('ExecReload=/bin/kill -HUP $MAINPID'))
    })

    it('restarts forever and starts on login', () => {
      ok(unit.includes('Restart=always'))
      ok(unit.includes('StartLimitIntervalSec=0'))
      ok(unit.includes('[Install]\nWantedBy=default.target'))
    })

    it('uses a label outside the reconciled service prefix', () => {
      ok(!GATEWAY_UNIT_LABEL.startsWith('denvig.'))
    })
  })

  describe('generateNginxMainConfig() for a user-owned nginx', () => {
    const dir = getUserNginxDir()
    const config = generateNginxMainConfig(userServers, {
      userOwned: true,
      mimeTypesPath: '/etc/nginx/mime.types',
    })

    it('keeps the pid file and logs inside the denvig directory', () => {
      ok(config.includes(`pid ${dir}/nginx.pid;`))
      ok(config.includes(`error_log ${dir}/logs/error.log;`))
      ok(config.includes(`access_log ${dir}/logs/access.log;`))
    })

    it('keeps temp files inside the denvig directory', () => {
      for (const name of ['client_body', 'proxy', 'fastcgi', 'uwsgi', 'scgi']) {
        ok(config.includes(`${name}_temp_path ${dir}/temp/${name};`))
      }
    })

    it('includes the shared mime.types', () => {
      ok(config.includes('include /etc/nginx/mime.types;'))
    })

    it('omits mime.types when none is installed', () => {
      const withoutMime = generateNginxMainConfig(userServers, {
        userOwned: true,
        mimeTypesPath: null,
      })
      ok(!withoutMime.includes('mime.types'))
      ok(withoutMime.includes('default_type application/octet-stream;'))
    })

    it('leaves the Homebrew config without runtime overrides', () => {
      const brew = generateNginxMainConfig(HOMEBREW_GATEWAY_CONFIGS_PATH)
      ok(!brew.includes('pid '))
      ok(!brew.includes('_temp_path'))
      ok(brew.includes('worker_processes 4;\n\nevents {'))
      ok(
        brew.includes(
          'http {\n  include /opt/homebrew/etc/nginx/mime.types;\n  default_type',
        ),
      )
    })
  })
})
