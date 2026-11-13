import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { after, before, describe, it } from 'node:test'

import { createDaemon, type Daemon } from './daemon.ts'
import { route } from './server.ts'

/**
 * Poll until `check` passes, as filesystem events arrive asynchronously.
 */
const eventually = async (check: () => Promise<boolean> | boolean) => {
  const deadline = Date.now() + 5000
  while (Date.now() < deadline) {
    if (await check()) return
    await new Promise((resolve) => setTimeout(resolve, 25))
  }
  throw new Error('condition not met within 5s')
}

const writeProject = (path: string, actions: Record<string, string>) => {
  mkdirSync(path, { recursive: true })
  const lines = Object.entries(actions).map(
    ([name, command]) => `  ${name}:\n    command: ${command}`,
  )
  writeFileSync(
    join(path, '.denvig.yml'),
    `name: ${path.split('/').pop()}\nactions:\n${lines.join('\n')}\n`,
  )
}

type ProjectsBody = {
  projects: { path: string; worktrees: { actions: object }[] }[]
}

describe('daemon', () => {
  let root: string
  let daemon: Daemon
  const env = { ...process.env }

  before(async () => {
    root = mkdtempSync(join(tmpdir(), 'denvigd-'))
    process.env.DENVIG_GLOBAL_CONFIG_PATH = join(root, 'config.yml')
    process.env.DENVIG_PROJECT_PATHS = join(root, 'src', '*')
    writeProject(join(root, 'src', 'alpha'), { hello: 'echo hello' })
    writeProject(join(root, 'src', 'beta'), { build: 'echo build' })
    daemon = createDaemon({ debounceMs: 20, log: () => {} })
    await daemon.start()
  })

  after(() => {
    daemon.stop()
    rmSync(root, { recursive: true, force: true })
    process.env = env
  })

  const projects = async () =>
    (await route(daemon, 'GET', '/api/projects')).body as ProjectsBody

  it('should list scanned projects', async () => {
    const { projects: list } = await projects()
    deepStrictEqual(
      list.map((p) => p.path.split('/').pop()),
      ['alpha', 'beta'],
    )
  })

  it('should look up a project by encoded path', async () => {
    const path = encodeURIComponent(join(root, 'src', 'alpha'))
    const result = await route(daemon, 'GET', `/api/projects/${path}`)
    strictEqual(result.status, 200)
  })

  it('should return 404 for unknown projects and routes', async () => {
    strictEqual((await route(daemon, 'GET', '/api/projects/nope')).status, 404)
    strictEqual((await route(daemon, 'GET', '/nope')).status, 404)
    strictEqual((await route(daemon, 'POST', '/api/projects')).status, 405)
  })

  it('should serve dependencies for a project', async () => {
    const path = encodeURIComponent(join(root, 'src', 'alpha'))
    const result = await route(
      daemon,
      'GET',
      `/api/projects/${path}/dependencies`,
    )
    strictEqual(result.status, 200)
    ok(Array.isArray((result.body as { dependencies: unknown[] }).dependencies))
  })

  it('should pick up .denvig.yml changes', async () => {
    writeProject(join(root, 'src', 'alpha'), { renamed: 'echo renamed' })
    await eventually(async () => {
      const alpha = (await projects()).projects[0]
      return 'renamed' in alpha.worktrees[0].actions
    })
  })

  it('should pick up new and removed projects', async () => {
    writeProject(join(root, 'src', 'gamma'), { test: 'echo test' })
    await eventually(async () => (await projects()).projects.length === 3)

    rmSync(join(root, 'src', 'beta'), { recursive: true, force: true })
    await eventually(async () => (await projects()).projects.length === 2)
  })
})
