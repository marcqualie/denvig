/** biome-ignore-all lint/suspicious/noExplicitAny: launchctl methods are overridden for mocking */
import { ok, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import launchctl from '../lib/services/launchctl.ts'
import { getGatewayRoute, setGatewayRoute } from '../lib/services/state.ts'
import { createMockProject } from '../test/mock.ts'

describe('DenvigService', () => {
  let originalHome: string | undefined
  let tmpHome = ''

  beforeEach(() => {
    originalHome = process.env.HOME
    tmpHome = mkdtempSync(`${tmpdir()}/denvig-service-resource-`)
    process.env.HOME = tmpHome
    mkdirSync(`${tmpHome}/Library/LaunchAgents`, { recursive: true })
  })
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    else delete process.env.HOME
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('start({ claimDomain: true }) moves a domain owned by another running service', async (t) => {
    await setGatewayRoute('hello.denvig.me', {
      project: 'other-project',
      service: 'hello',
      port: 8080,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })

    const project = createMockProject({
      slug: 'github:owner/repo',
      path: `${tmpHome}/repo`,
      config: {
        name: 'repo',
        $sources: [],
        services: {
          hello: {
            command: 'node server.js',
            http: { domain: 'hello.denvig.me' },
          },
        },
      } as any,
    })

    t.mock.method(launchctl, 'print', async () => null)
    t.mock.method(launchctl, 'enable', async () => ({
      success: true,
      output: '',
    }))
    t.mock.method(launchctl, 'bootstrap', async () => ({
      success: true,
      output: '',
    }))

    const service = await project.services.retrieve('hello')
    const response = await service.start({ claimDomain: true })

    ok(response)
    const route = await getGatewayRoute('hello.denvig.me')
    ok(route)
    strictEqual(route.project !== 'other-project', true)
    strictEqual(route.service, 'hello')
    strictEqual(route.defaultService, false)
    strictEqual(route.desiredStatus, 'running')
  })
})
