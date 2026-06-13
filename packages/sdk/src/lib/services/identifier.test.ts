import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, it } from 'node:test'

import { createMockInternalProject } from '../../test/mock.ts'
import { getServiceContext, parseServiceIdentifier } from './identifier.ts'

describe('parseServiceIdentifier', () => {
  it('should parse a plain service name as current project', () => {
    const result = parseServiceIdentifier('api', 'github:owner/repo')
    deepStrictEqual(result, {
      projectSlug: 'github:owner/repo',
      serviceName: 'api',
    })
  })

  it('should parse global: prefix', () => {
    const result = parseServiceIdentifier('global:redis', 'github:owner/repo')
    deepStrictEqual(result, {
      projectSlug: 'global',
      serviceName: 'redis',
    })
  })

  it('should parse global: prefix with hyphenated name', () => {
    const result = parseServiceIdentifier(
      'global:my-database',
      'github:owner/repo',
    )
    deepStrictEqual(result, {
      projectSlug: 'global',
      serviceName: 'my-database',
    })
  })

  it('should parse global: with empty service name', () => {
    const result = parseServiceIdentifier('global:', 'github:owner/repo')
    deepStrictEqual(result, {
      projectSlug: 'global',
      serviceName: '',
    })
  })
})

describe('getServiceContext local path identifiers', () => {
  let originalHome: string | undefined
  let tmpHome = ''
  let projectDir = ''

  beforeEach(() => {
    originalHome = process.env.HOME
    tmpHome = mkdtempSync(`${tmpdir()}/denvig-identifier-`)
    process.env.HOME = tmpHome
    projectDir = `${tmpHome}/src/owner/myapp`
    mkdirSync(projectDir, { recursive: true })
    writeFileSync(
      `${projectDir}/.denvig.yml`,
      'name: MyApp\nservices:\n  dev:\n    command: echo dev\n',
      'utf-8',
    )
  })
  afterEach(() => {
    if (originalHome !== undefined) process.env.HOME = originalHome
    else delete process.env.HOME
    rmSync(tmpHome, { recursive: true, force: true })
  })

  const currentProject = () =>
    createMockInternalProject({ path: '/tmp/elsewhere' })

  it('infers the service name from the final segment of a local: identifier', async () => {
    const ctx = await getServiceContext(
      `local:${projectDir}/dev`,
      currentProject(),
    )
    strictEqual(ctx.serviceName, 'dev')
    strictEqual(ctx.project.path, projectDir)
  })

  it('expands ~ in local: identifiers', async () => {
    const ctx = await getServiceContext(
      'local:~/src/owner/myapp/dev',
      currentProject(),
    )
    strictEqual(ctx.serviceName, 'dev')
    strictEqual(ctx.project.path, projectDir)
  })

  it('infers the service name from a bare path identifier', async () => {
    const ctx = await getServiceContext(`${projectDir}/dev`, currentProject())
    strictEqual(ctx.serviceName, 'dev')
    strictEqual(ctx.project.path, projectDir)
  })
})
