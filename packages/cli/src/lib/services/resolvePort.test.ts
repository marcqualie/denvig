import { ok, strictEqual } from 'node:assert'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'
import {
  ServiceManager,
  type ServiceManagerProject,
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
        http: { port: 8080, domain: 'hello.denvig.me' },
      },
      worker: {
        command: 'node worker.js',
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

  it('resolves a port for an http service', async () => {
    const project = createProject('/tmp/wt-port')
    const manager = new ServiceManager(project)

    const resolution = await resolveServicePortForCli(manager, 'hello', {
      json: true,
    })

    ok(resolution !== null)
    ok(typeof resolution.port === 'number')
  })

  it('allocates a random port when --random-port is passed', async () => {
    const project = createProject('/tmp/wt-random')
    const manager = new ServiceManager(project)

    const resolution = await resolveServicePortForCli(manager, 'hello', {
      json: true,
      'random-port': true,
    })

    ok(resolution !== null)
    ok(resolution.port !== undefined)
    ok(resolution.port !== 8080)
  })

  it('returns no port for a service without an http block', async () => {
    const project = createProject('/tmp/wt-noport')
    const manager = new ServiceManager(project)

    const resolution = await resolveServicePortForCli(manager, 'worker', {
      json: true,
    })

    ok(resolution !== null)
    strictEqual(resolution.port, undefined)
  })
})
