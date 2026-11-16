/**
 * biome-ignore-all lint/suspicious/noExplicitAny: service backend methods are overridden for mocking
 */
import { ok, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import serviceBackend from '../lib/services/backend.ts'
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

  it('start({ domains }) routes an explicit domain owned by another running service', async (t) => {
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

    t.mock.method(serviceBackend, 'print', async () => null)
    t.mock.method(serviceBackend, 'enable', async () => ({
      success: true,
      output: '',
    }))
    t.mock.method(serviceBackend, 'bootstrap', async () => ({
      success: true,
      output: '',
    }))

    const service = await project.services.retrieve('hello')
    const response = await service.start({ domains: ['hello.denvig.me'] })

    ok(response)
    const route = await getGatewayRoute('hello.denvig.me')
    ok(route)
    strictEqual(route.project !== 'other-project', true)
    strictEqual(route.service, 'hello')
    strictEqual(route.desiredStatus, 'running')
  })
})
