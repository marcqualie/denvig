import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { listProjects, matchesPattern } from './projects.ts'

describe('matchesPattern()', () => {
  it('should match an exact path', () => {
    strictEqual(matchesPattern('/src/acme/api', '/src/acme/api'), true)
  })

  it('should match a single directory level per wildcard', () => {
    strictEqual(matchesPattern('/src/acme/api', '/src/acme/*'), true)
    strictEqual(matchesPattern('/src/acme/api', '/src/*/*'), true)
  })

  it('should not match a different path', () => {
    strictEqual(matchesPattern('/src/acme/api', '/src/other/*'), false)
  })

  it('should not match when the pattern is longer than the path', () => {
    strictEqual(matchesPattern('/src/acme', '/src/acme/*'), false)
  })

  it('should match paths inside a matched directory', () => {
    strictEqual(matchesPattern('/src/acme/api', '/src/acme'), true)
  })

  it('should expand ~ in the pattern', () => {
    strictEqual(
      matchesPattern(`${process.env.HOME}/src/acme/api`, '~/src/acme/*'),
      true,
    )
  })

  it('should ignore trailing slashes', () => {
    strictEqual(matchesPattern('/src/acme/api/', '/src/acme/api'), true)
    strictEqual(matchesPattern('/src/acme/api', '/src/acme/api/'), true)
  })
})

describe('listProjects()', () => {
  let root: string
  const originalProjectPaths = process.env.DENVIG_PROJECT_PATHS

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'denvig-projects-'))
    mkdirSync(join(root, 'src', 'acme', 'api'), { recursive: true })
    mkdirSync(join(root, 'src', 'acme', 'web'), { recursive: true })
    mkdirSync(join(root, 'src', 'example-project', 'api'), { recursive: true })
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
    if (originalProjectPaths !== undefined) {
      process.env.DENVIG_PROJECT_PATHS = originalProjectPaths
    } else {
      delete process.env.DENVIG_PROJECT_PATHS
    }
  })

  it('should list every project matching the patterns', async () => {
    process.env.DENVIG_PROJECT_PATHS = `${root}/src/*/*`

    const projects = await listProjects()

    deepStrictEqual(
      projects.map((project) => project.path),
      [
        `${root}/src/acme/api`,
        `${root}/src/acme/web`,
        `${root}/src/example-project/api`,
      ],
    )
  })

  it('should exclude paths matching a ! pattern', async () => {
    process.env.DENVIG_PROJECT_PATHS = `${root}/src/*/*,!${root}/src/example-project/*`

    const projects = await listProjects()

    deepStrictEqual(
      projects.map((project) => project.path),
      [`${root}/src/acme/api`, `${root}/src/acme/web`],
    )
  })

  it('should exclude everything inside an excluded directory', async () => {
    process.env.DENVIG_PROJECT_PATHS = `${root}/src/*/*,!${root}/src/example-project`

    const projects = await listProjects()

    deepStrictEqual(
      projects.map((project) => project.path),
      [`${root}/src/acme/api`, `${root}/src/acme/web`],
    )
  })

  it('should exclude a single project path', async () => {
    process.env.DENVIG_PROJECT_PATHS = `${root}/src/*/*,!${root}/src/acme/web`

    const projects = await listProjects()

    deepStrictEqual(
      projects.map((project) => project.path),
      [`${root}/src/acme/api`, `${root}/src/example-project/api`],
    )
  })
})
