import assert from 'node:assert'
import { execSync } from 'node:child_process'
import fs from 'node:fs'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { DenvigProject } from '../project.ts'
import { resolveWorktreeProject } from './worktree.ts'

const primaryPath = '/tmp/denvig-test-worktree-primary'
const worktreePath = `${primaryPath}+feature`

const initRepo = () => {
  fs.mkdirSync(primaryPath, { recursive: true })
  execSync('git init -q -b main', { cwd: primaryPath })
  execSync('git config user.email "test@denvig.test"', { cwd: primaryPath })
  execSync('git config user.name "Denvig Test"', { cwd: primaryPath })
  execSync('git commit --allow-empty -q -m "Initial commit"', {
    cwd: primaryPath,
  })
}

describe('resolveWorktreeProject()', () => {
  beforeEach(() => initRepo())
  afterEach(() => {
    fs.rmSync(primaryPath, { recursive: true, force: true })
    fs.rmSync(worktreePath, { recursive: true, force: true })
  })

  it('resolves a sibling worktree by branch name', async () => {
    execSync(`git worktree add ${worktreePath} -b feature`, {
      cwd: primaryPath,
    })
    const primary = await DenvigProject.retrieve(primaryPath)
    const worktreeProject = await resolveWorktreeProject(primary, 'feature')
    const realWorktreePath = fs.realpathSync(worktreePath)
    assert.strictEqual(worktreeProject.path, realWorktreePath)
  })

  it('resolves "main" to the primary checkout when called from a worktree', async () => {
    execSync(`git worktree add ${worktreePath} -b feature`, {
      cwd: primaryPath,
    })
    const worktreeProject = await DenvigProject.retrieve(worktreePath)
    const primaryProject = await resolveWorktreeProject(worktreeProject, 'main')
    const realPrimaryPath = fs.realpathSync(primaryPath)
    assert.strictEqual(primaryProject.path, realPrimaryPath)
  })

  it('throws when the branch does not match any worktree', async () => {
    const primary = await DenvigProject.retrieve(primaryPath)
    await assert.rejects(
      () => resolveWorktreeProject(primary, 'nonexistent'),
      /Worktree with branch "nonexistent" not found/,
    )
  })
})
