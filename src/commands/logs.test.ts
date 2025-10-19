import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { DenvigProject } from '../lib/project.ts'
import { generateDenvigResourceHash } from '../lib/resources.ts'
import { logsCommand } from './logs.ts'

describe('logsCommand', () => {
  it('should show last N lines using --lines flag', async () => {
    const project = new DenvigProject('denvig')
    project.config.services = {
      'test-logs': {
        command: 'echo hi',
      },
    }

    const { hash } = generateDenvigResourceHash({
      project,
      resource: 'service/test-logs',
    })

    const home = (await import('node:os')).homedir()
    const path = (await import('node:path')).resolve(
      home,
      '.denvig',
      'logs',
      `${hash}.log`,
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
      },
    )
    ok(result2.success)

    // Clean up
    await fs.unlink(path).catch(() => {})
  })
})
