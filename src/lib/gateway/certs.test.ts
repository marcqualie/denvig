import { ok, strictEqual } from 'node:assert'
import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { describe, it } from 'node:test'

import { getAutoCertDir, isAutoCertPath, resolveCertPath } from './certs.ts'

describe('gateway certs', () => {
  describe('resolveCertPath()', () => {
    it('should return null for undefined path', () => {
      const result = resolveCertPath(
        undefined,
        'example.localhost',
        '/project',
        'cert',
      )
      strictEqual(result, null)
    })

    it('should resolve "auto" to ~/.denvig/certs/{domain}/fullchain.pem', () => {
      const result = resolveCertPath(
        'auto',
        'example.localhost',
        '/project',
        'cert',
      )
      strictEqual(
        result,
        resolve(
          homedir(),
          '.denvig',
          'certs',
          'example.localhost',
          'fullchain.pem',
        ),
      )
    })

    it('should resolve "auto" to ~/.denvig/certs/{domain}/privkey.pem for key type', () => {
      const result = resolveCertPath(
        'auto',
        'example.localhost',
        '/project',
        'key',
      )
      strictEqual(
        result,
        resolve(
          homedir(),
          '.denvig',
          'certs',
          'example.localhost',
          'privkey.pem',
        ),
      )
    })

    it('should resolve relative paths against project path', () => {
      const result = resolveCertPath(
        'certs/fullchain.pem',
        'example.localhost',
        '/Users/test/project',
        'cert',
      )
      strictEqual(result, '/Users/test/project/certs/fullchain.pem')
    })

    it('should keep absolute paths as-is', () => {
      const result = resolveCertPath(
        '/etc/ssl/certs/cert.pem',
        'example.localhost',
        '/project',
        'cert',
      )
      strictEqual(result, '/etc/ssl/certs/cert.pem')
    })
  })

  describe('isAutoCertPath()', () => {
    it('should return true for "auto"', () => {
      ok(isAutoCertPath('auto'))
    })

    it('should return false for undefined', () => {
      ok(!isAutoCertPath(undefined))
    })

    it('should return false for relative paths', () => {
      ok(!isAutoCertPath('certs/cert.pem'))
    })

    it('should return false for absolute paths', () => {
      ok(!isAutoCertPath('/etc/ssl/cert.pem'))
    })
  })

  describe('getAutoCertDir()', () => {
    it('should return ~/.denvig/certs/{domain}/', () => {
      const result = getAutoCertDir('example.localhost')
      strictEqual(
        result,
        resolve(homedir(), '.denvig', 'certs', 'example.localhost'),
      )
    })
  })
})
