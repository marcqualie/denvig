import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { createMockProject } from '../test/mock.ts'
import { getProjectInfo } from './projectInfo.ts'

import type { DenvigProject } from './project.ts'

describe('getProjectInfo()', () => {
  it('should return project info with correct slug', async () => {
    const project = createMockProject({ slug: 'github:marcqualie/denvig' })
    const info = await getProjectInfo(project)

    strictEqual(info.slug, 'github:marcqualie/denvig')
  })

  it('should return project info with correct name', async () => {
    const project = createMockProject({ name: 'My Project' })
    const info = await getProjectInfo(project)

    strictEqual(info.name, 'My Project')
  })

  it('should return project info with correct path', async () => {
    const project = createMockProject({ path: '/Users/test/project' })
    const info = await getProjectInfo(project)

    strictEqual(info.path, '/Users/test/project')
  })

  it('should return null config when no $sources', async () => {
    const project = createMockProject({
      config: { name: 'test', $sources: [] } as DenvigProject['config'],
    })
    const info = await getProjectInfo(project)

    strictEqual(info.config, null)
  })

  it('should return config without $sources when config file exists', async () => {
    const project = createMockProject({
      config: {
        name: 'configured-project',
        $sources: ['/path/to/.denvig.yml'],
      } as DenvigProject['config'],
    })
    const info = await getProjectInfo(project)

    ok(info.config !== null)
    strictEqual(info.config.name, 'configured-project')
    ok(!('$sources' in info.config))
  })

  it('should return serviceStatus "none" when no services configured', async () => {
    const project = createMockProject()
    const info = await getProjectInfo(project)

    strictEqual(info.serviceStatus, 'none')
  })

  it('should return all required ProjectInfo fields', async () => {
    const project = createMockProject()
    const info = await getProjectInfo(project)

    ok('slug' in info)
    ok('name' in info)
    ok('path' in info)
    ok('config' in info)
    ok('serviceStatus' in info)
  })
})
