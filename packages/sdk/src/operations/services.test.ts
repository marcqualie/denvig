import { deepStrictEqual } from 'node:assert'
import { execFileSync } from 'node:child_process'
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { DenvigProject } from '../lib/project.ts'
import launchctl from '../lib/services/launchctl.ts'
import { collectServiceRows } from './services.ts'

describe('collectServiceRows in a detached worktree', () => {
  let originalHome: string | undefined
  let tmpDir = ''
  let primaryPath = ''
  let worktreePath = ''

  beforeEach(() => {
    originalHome = process.env.HOME
    tmpDir = realpathSync(mkdtempSync(`${tmpdir()}/denvig-services-wt-`))
    process.env.HOME = tmpDir
    primaryPath = `${tmpDir}/repo`
    worktreePath = `${primaryPath}/.worktrees/test`
    mkdirSync(primaryPath)
    const git = (...args: string[]) =>
      execFileSync('git', args, { cwd: primaryPath, stdio: 'ignore' })
    git('init', '-q', '-b', 'main')
    git(
      '-c',
      'user.name=t',
      '-c',
      'user.email=t@t',
      'commit',
      '-q',
      '--allow-empty',
      '-m',
      'init',
    )
    git('worktree', 'add', '-q', '.worktrees/test', '-b', 'test')

    const config = [
      'name: App',
      'services:',
      '  db:',
      '    runtime: docker',
      '    image: mongo:8',
      '    container:',
      '      volumes:',
      '        - app-mongodb:/data/db',
      '  web:',
      '    command: echo web',
      '',
    ].join('\n')
    writeFileSync(`${primaryPath}/.denvig.yml`, config, 'utf-8')
    writeFileSync(`${worktreePath}/.denvig.yml`, config, 'utf-8')
  })
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    else delete process.env.HOME
    rmSync(tmpDir, { recursive: true, force: true })
  })

  const summarise = (rows: Awaited<ReturnType<typeof collectServiceRows>>) =>
    rows.map((r) => ({
      name: r.service.name,
      path: r.service.project.path,
      label: r.label,
      sharedFrom: r.sharedFrom,
    }))

  it("lists the primary checkout's instance of services with shared volumes", async (t) => {
    t.mock.method(launchctl, 'list', async () => [])
    const project = await DenvigProject.retrieve(worktreePath)

    const rows = await collectServiceRows(project, project.activeWorktree, {
      worktrees: false,
    })

    const label = project.activeWorktree.slug
    deepStrictEqual(summarise(rows), [
      { name: 'db', path: primaryPath, label, sharedFrom: 'main' },
      { name: 'web', path: worktreePath, label, sharedFrom: undefined },
    ])
  })

  it('only nests services the worktree can run', async (t) => {
    t.mock.method(launchctl, 'list', async () => [])
    const project = await DenvigProject.retrieve(worktreePath)

    const rows = await collectServiceRows(project, project.activeWorktree)

    const primary = project.primaryWorktree.slug
    deepStrictEqual(summarise(rows), [
      { name: 'db', path: primaryPath, label: primary, sharedFrom: undefined },
      { name: 'web', path: primaryPath, label: primary, sharedFrom: undefined },
      { name: 'web', path: worktreePath, label: 'test', sharedFrom: undefined },
    ])
  })
})
