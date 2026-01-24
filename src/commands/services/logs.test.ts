import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { logsCommand } from './logs.ts'

import type { DenvigProject } from '../../lib/project.ts'

/** Create a mock project with the given slug for testing */
const createMockProject = (
  slug: string,
  path = '/tmp/test-project',
): DenvigProject =>
  ({
    slug,
    path,
    config: { name: slug, $sources: [], services: {} },
  }) as unknown as DenvigProject

describe('logsCommand', () => {
  it('should show last N lines using --lines flag', async () => {
    const project = createMockProject('workspace/denvig', process.cwd())
    project.config.services = {
      'test-logs': {
        command: 'echo hi',
      },
    }

    const home = (await import('node:os')).homedir()
    const path = (await import('node:path')).resolve(
      home,
      '.denvig',
      'logs',
      'workspace__denvig__test-logs.log',
    )

    const fs = await import('node:fs/promises')
    await fs.mkdir(
      (await import('node:path')).resolve(home, '.denvig', 'logs'),
      { recursive: true },
    )
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`)
    await fs.writeFile(path, `${lines.join('\n')}\n`, 'utf-8')

    // Run using --lines
    const result1 = await logsCommand.run(
      project,
      { name: 'test-logs' },
      {
        lines: 5,
        follow: false,
        format: 'table',
      },
    )
    ok(result1.success)

    // Run using -n alias
    const result2 = await logsCommand.run(
      project,
      { name: 'test-logs' },
      {
        n: 3,
        follow: false,
        format: 'table',
      },
    )
    ok(result2.success)

    // Clean up
    await fs.unlink(path).catch(() => {})
  })
})
