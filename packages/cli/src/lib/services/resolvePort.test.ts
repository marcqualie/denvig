import { ok, strictEqual } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  ServiceManager,
  type ServiceManagerProject,
  setGatewayRoute,
} from '@denvig/sdk/internal'

import { resolveServicePortForCli } from './resolvePort.ts'

const createProject = (path: string): ServiceManagerProject => ({
  id: `id-${path.split('/').pop()}`,
  slug: 'github:owner/repo',
  name: 'repo',
  path,
  config: {
    services: {
      hello: {
        command: 'node server.js',
        http: { domain: 'hello.denvig.me' },
      },
    },
  },
})

describe('resolveServicePortForCli', () => {
  let originalHome: string | undefined
  let tmpHome = ''

  beforeEach(() => {
    originalHome = process.env.HOME
    tmpHome = mkdtempSync(`${tmpdir()}/denvig-resolve-port-`)
    process.env.HOME = tmpHome
  })
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    else delete process.env.HOME
    rmSync(tmpHome, { recursive: true, force: true })
  })

  it('claims the domain when --claim-domains is passed', async () => {
    const project = createProject('/tmp/wt-claim')
    const manager = new ServiceManager(project)

    const resolution = await resolveServicePortForCli(
      manager,
      'hello',
      { json: true, 'claim-domains': true },
      project,
    )

    ok(resolution !== null)
    strictEqual(resolution.claimDomains, true)
    ok(resolution.port !== undefined)
  })

  it('declines the claim when --no-claim-domains is passed', async () => {
    const project = createProject('/tmp/wt-noclaim')
    const manager = new ServiceManager(project)

    const resolution = await resolveServicePortForCli(
      manager,
      'hello',
      { json: true, 'no-claim-domains': true },
      project,
    )

    ok(resolution !== null)
    strictEqual(resolution.claimDomains, false)
  })

  it('defaults to not claiming a domain owned by another service when non-interactive', async () => {
    await setGatewayRoute('hello.denvig.me', {
      project: 'other-project',
      service: 'hello',
      port: 8080,
      secure: false,
      defaultService: true,
      desiredStatus: 'running',
    })
    const project = createProject('/tmp/wt-conflict')
    const manager = new ServiceManager(project)

    const resolution = await resolveServicePortForCli(
      manager,
      'hello',
      { json: true },
      project,
    )

    ok(resolution !== null)
    strictEqual(resolution.claimDomains, false)
  })

  it('leaves the claim undecided when the domain has no other owner', async () => {
    const project = createProject('/tmp/wt-free')
    const manager = new ServiceManager(project)

    const resolution = await resolveServicePortForCli(
      manager,
      'hello',
      { json: true },
      project,
    )

    ok(resolution !== null)
    strictEqual(resolution.claimDomains, null)
  })
})
