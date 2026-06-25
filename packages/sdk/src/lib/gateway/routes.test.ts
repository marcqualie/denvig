import assert from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { createGlobalProject } from '../services/global.ts'
import { setCert, setGatewayRoute } from '../services/state.ts'
import { resolveGatewayServices } from './routes.ts'

let originalHome: string | undefined
let tmpHome = ''

/**
 * Routes are keyed to the deterministic global project id so they resolve to a
 * real checkout (slug `global`) without registering external projects.
 */
const globalId = async () => (await createGlobalProject()).id

describe('resolveGatewayServices', () => {
  beforeEach(() => {
    originalHome = process.env.HOME
    tmpHome = mkdtempSync(`${tmpdir()}/denvig-routes-`)
    process.env.HOME = tmpHome
  })
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    else delete process.env.HOME
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('returns no services when state has no routes', async () => {
    assert.deepStrictEqual(await resolveGatewayServices(), [])
  })

  it('groups cnames with their primary domain for one service', async () => {
    const project = await globalId()
    await setGatewayRoute('api.denvig.localhost', {
      project,
      service: 'api',
      port: 3000,
      defaultService: true,
      secure: false,
      desiredStatus: 'running',
    })
    await setGatewayRoute('api-alt.denvig.localhost', {
      project,
      service: 'api',
      port: 3000,
      defaultService: false,
      secure: false,
      desiredStatus: 'running',
    })

    const services = await resolveGatewayServices()
    assert.strictEqual(services.length, 1)
    assert.strictEqual(services[0].serviceName, 'api')
    assert.strictEqual(services[0].domain, 'api.denvig.localhost')
    assert.deepStrictEqual(services[0].cnames, ['api-alt.denvig.localhost'])
    assert.strictEqual(services[0].certStatus, 'not_configured')
  })

  it('excludes routes whose desiredStatus is not running', async () => {
    const project = await globalId()
    await setGatewayRoute('running.denvig.localhost', {
      project,
      service: 'up',
      port: 3000,
      defaultService: true,
      secure: false,
      desiredStatus: 'running',
    })
    await setGatewayRoute('stopped.denvig.localhost', {
      project,
      service: 'down',
      port: 3001,
      defaultService: true,
      secure: false,
      desiredStatus: 'stopped',
    })

    const services = await resolveGatewayServices()
    assert.deepStrictEqual(
      services.map((s) => s.serviceName),
      ['up'],
    )
  })

  it('resolves a secure route to its cert and marks a missing one', async () => {
    const project = await globalId()
    await setCert('wildcard', {
      dir: '/certs/wildcard',
      certPath: '/certs/wildcard/fullchain.pem',
      keyPath: '/certs/wildcard/privkey.pem',
      domains: ['secure.denvig.localhost'],
    })
    await setGatewayRoute('secure.denvig.localhost', {
      project,
      service: 'secure',
      port: 3000,
      defaultService: true,
      secure: true,
      desiredStatus: 'running',
      cert: 'wildcard',
    })
    await setGatewayRoute('nocert.denvig.localhost', {
      project,
      service: 'nocert',
      port: 3001,
      defaultService: true,
      secure: true,
      desiredStatus: 'running',
      cert: 'absent',
    })

    const services = await resolveGatewayServices()
    const secure = services.find((s) => s.serviceName === 'secure')
    const noCert = services.find((s) => s.serviceName === 'nocert')

    assert.strictEqual(secure?.certStatus, 'valid')
    assert.strictEqual(secure?.sslCertPath, '/certs/wildcard/fullchain.pem')
    assert.strictEqual(secure?.sslKeyPath, '/certs/wildcard/privkey.pem')
    assert.strictEqual(noCert?.certStatus, 'missing')
  })

  it('sorts services alphabetically by primary domain', async () => {
    const project = await globalId()
    for (const [domain, service] of [
      ['web.denvig.localhost', 'web'],
      ['api.denvig.localhost', 'api'],
      ['mail.denvig.localhost', 'mail'],
    ]) {
      await setGatewayRoute(domain, {
        project,
        service,
        port: 3000,
        defaultService: true,
        secure: false,
        desiredStatus: 'running',
      })
    }

    const services = await resolveGatewayServices()
    assert.deepStrictEqual(
      services.map((s) => s.domain),
      ['api.denvig.localhost', 'mail.denvig.localhost', 'web.denvig.localhost'],
    )
  })
})
