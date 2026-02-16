import { ok } from 'node:assert'
import { hostname } from 'node:os'
import { describe, it } from 'node:test'

import { createMockProject } from '../../test/mock.ts'
import { logsCommand } from './logs.ts'

describe('logsCommand', () => {
  it('should show last N lines using --lines flag', async () => {
    const project = createMockProject({
      slug: 'workspace/denvig',
      path: process.cwd(),
    })
    project.config.services = {
      'test-logs': {
        command: 'echo hi',
      },
    }

    const home = (await import('node:os')).homedir()
    const { resolve } = await import('node:path')
    const fs = await import('node:fs/promises')

    // Set up new-format log directory: ~/.denvig/services/{serviceId}/logs/
    const serviceId = `${project.id}.test-logs`
    const logDir = resolve(home, '.denvig', 'services', serviceId, 'logs')
    await fs.mkdir(logDir, { recursive: true })

    // Create a timestamped log file
    const logFile = '1700000000.log'
    const logPath = resolve(logDir, logFile)
    const lines = Array.from({ length: 20 }, (_, i) => `line-${i + 1}`)
    await fs.writeFile(logPath, `${lines.join('\n')}\n`, 'utf-8')

    // Create the latest symlink
    const symlinkPath = resolve(logDir, `latest.${hostname()}.log`)
    await fs.unlink(symlinkPath).catch(() => {})
    await fs.symlink(logFile, symlinkPath)

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
    await fs
      .rm(resolve(home, '.denvig', 'services', serviceId), {
        recursive: true,
        force: true,
      })
      .catch(() => {})
  })
})
