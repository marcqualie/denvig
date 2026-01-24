import { ok, strictEqual } from 'node:assert'
import { createHash } from 'node:crypto'
import { describe, it } from 'node:test'

import {
  constructDenvigResourceId,
  generateDenvigResourceHash,
} from './resources.ts'

import type { DenvigProject } from './project.ts'

/** Create a mock project with the given slug for testing */
const createMockProject = (slug: string): DenvigProject =>
  ({ slug }) as DenvigProject

describe('constructDenvigResourceId()', () => {
  it('constructs id for a basic action in root workspace', () => {
    const project = createMockProject('marcqualie/denvig')

    const expectedId = `@marcqualie/denvig|root|action/build`
    const id = constructDenvigResourceId({
      project,
      resource: 'action/build',
    })

    strictEqual(id, expectedId)
  })

  it('throws an error with an invalid resource format', () => {
    const project = createMockProject('my-project')

    const resource = 'invalid-resource-format' as unknown as
      | `action/${string}`
      | `service/${string}`

    try {
      constructDenvigResourceId({
        project,
        resource,
      })

      // If no error is thrown, fail the test
    } catch (error) {
      ok(error instanceof Error)
      return
    }

    ok(false, 'Expected an error to be thrown for invalid resource format')
  })
})

describe('generateDenvigResourceHash()', () => {
  it('constructs id and hash for a basic action in root workspace', () => {
    const project = createMockProject('marcqualie/denvig')

    const result = generateDenvigResourceHash({
      project,
      resource: 'action/build',
    })

    strictEqual(result.id, '@marcqualie/denvig|root|action/build')
    const expectedHash = createHash('sha256').update(result.id).digest('hex')
    strictEqual(result.hash, expectedHash)
  })

  it('includes workspace when provided', () => {
    const project = createMockProject('my-project')

    const result = generateDenvigResourceHash({
      project,
      workspace: 'packages/ui',
      resource: 'action/build',
    })

    strictEqual(result.id, '@my-project|packages/ui|action/build')
  })

  it('uses "root" as default workspace when omitted', () => {
    const project = createMockProject('my-app')

    const result = generateDenvigResourceHash({
      project,
      resource: 'service/api',
    })
    strictEqual(result.id, '@my-app|root|service/api')
  })

  it('generates stable hashes for same inputs and different for different inputs', () => {
    const project = createMockProject('stable-test')

    const a = generateDenvigResourceHash({ project, resource: 'action/x' })
    const b = generateDenvigResourceHash({ project, resource: 'action/x' })
    strictEqual(a.id, b.id)
    strictEqual(a.hash, b.hash)

    const c = generateDenvigResourceHash({ project, resource: 'action/y' })
    ok(a.hash !== c.hash)
  })

  it('handles weird characters in slug, workspace and resource', () => {
    const project = createMockProject('org/Repo With Spaces-ç')

    const workspace = 'we!rd/space$|name'
    const resource = 'action/hello-world_v2|part'

    const result = generateDenvigResourceHash({ project, workspace, resource })
    strictEqual(result.id, `@org/Repo With Spaces-ç|${workspace}|${resource}`)
    const expectedHash = createHash('sha256').update(result.id).digest('hex')
    strictEqual(result.hash, expectedHash)
  })
})
