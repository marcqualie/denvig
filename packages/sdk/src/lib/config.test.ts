import { deepStrictEqual, ok, strictEqual } from 'node:assert'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { getEnvOverrides, getGlobalConfig, getProjectConfig } from './config.ts'

describe('getEnvOverrides()', () => {
  it('should return empty object when no env vars are set', () => {
    const originalProjectPaths = process.env.DENVIG_PROJECT_PATHS
    const originalQuickActions = process.env.DENVIG_QUICK_ACTIONS
    delete process.env.DENVIG_PROJECT_PATHS
    delete process.env.DENVIG_QUICK_ACTIONS

    const overrides = getEnvOverrides()

    deepStrictEqual(overrides, {})

    // Restore
    if (originalProjectPaths !== undefined)
      process.env.DENVIG_PROJECT_PATHS = originalProjectPaths
    if (originalQuickActions !== undefined)
      process.env.DENVIG_QUICK_ACTIONS = originalQuickActions
  })

  it('should parse DENVIG_PROJECT_PATHS as comma-separated list', () => {
    const original = process.env.DENVIG_PROJECT_PATHS
    process.env.DENVIG_PROJECT_PATHS = '~/src/*/*,~/.dotfiles,~/work/*'

    const overrides = getEnvOverrides()

    deepStrictEqual(overrides.projectPaths, [
      '~/src/*/*',
      '~/.dotfiles',
      '~/work/*',
    ])

    // Restore
    if (original !== undefined) {
      process.env.DENVIG_PROJECT_PATHS = original
    } else {
      delete process.env.DENVIG_PROJECT_PATHS
    }
  })

  it('should trim whitespace from DENVIG_PROJECT_PATHS', () => {
    const original = process.env.DENVIG_PROJECT_PATHS
    process.env.DENVIG_PROJECT_PATHS = ' ~/src/*/* , ~/.dotfiles '

    const overrides = getEnvOverrides()

    deepStrictEqual(overrides.projectPaths, ['~/src/*/*', '~/.dotfiles'])

    // Restore
    if (original !== undefined) {
      process.env.DENVIG_PROJECT_PATHS = original
    } else {
      delete process.env.DENVIG_PROJECT_PATHS
    }
  })

  it('should filter empty entries from DENVIG_PROJECT_PATHS', () => {
    const original = process.env.DENVIG_PROJECT_PATHS
    process.env.DENVIG_PROJECT_PATHS = '~/src/*/*,,~/.dotfiles,'

    const overrides = getEnvOverrides()

    deepStrictEqual(overrides.projectPaths, ['~/src/*/*', '~/.dotfiles'])

    // Restore
    if (original !== undefined) {
      process.env.DENVIG_PROJECT_PATHS = original
    } else {
      delete process.env.DENVIG_PROJECT_PATHS
    }
  })

  it('should parse DENVIG_QUICK_ACTIONS as comma-separated list', () => {
    const original = process.env.DENVIG_QUICK_ACTIONS
    process.env.DENVIG_QUICK_ACTIONS = 'build,dev,lint'

    const overrides = getEnvOverrides()

    deepStrictEqual(overrides.quickActions, ['build', 'dev', 'lint'])

    // Restore
    if (original !== undefined) {
      process.env.DENVIG_QUICK_ACTIONS = original
    } else {
      delete process.env.DENVIG_QUICK_ACTIONS
    }
  })

  it('should return empty array for empty DENVIG_QUICK_ACTIONS', () => {
    const original = process.env.DENVIG_QUICK_ACTIONS
    process.env.DENVIG_QUICK_ACTIONS = ''

    const overrides = getEnvOverrides()

    deepStrictEqual(overrides.quickActions, [])

    // Restore
    if (original !== undefined) {
      process.env.DENVIG_QUICK_ACTIONS = original
    } else {
      delete process.env.DENVIG_QUICK_ACTIONS
    }
  })

  it('should trim whitespace from DENVIG_QUICK_ACTIONS', () => {
    const original = process.env.DENVIG_QUICK_ACTIONS
    process.env.DENVIG_QUICK_ACTIONS = ' build , dev , lint '

    const overrides = getEnvOverrides()

    deepStrictEqual(overrides.quickActions, ['build', 'dev', 'lint'])

    // Restore
    if (original !== undefined) {
      process.env.DENVIG_QUICK_ACTIONS = original
    } else {
      delete process.env.DENVIG_QUICK_ACTIONS
    }
  })
})

describe('getGlobalConfig()', () => {
  describe('root config file does not exist', () => {
    it('should return the default config', async () => {
      const config = await getGlobalConfig()
      ok(config.projectPaths !== undefined)
      ok(Array.isArray(config.projectPaths))
    })
  })

  describe('environment variable overrides', () => {
    it('should override projectPaths from DENVIG_PROJECT_PATHS', async () => {
      const original = process.env.DENVIG_PROJECT_PATHS
      process.env.DENVIG_PROJECT_PATHS = '~/custom/path/*'

      const config = await getGlobalConfig()

      deepStrictEqual(config.projectPaths, ['~/custom/path/*'])

      // Restore
      if (original !== undefined) {
        process.env.DENVIG_PROJECT_PATHS = original
      } else {
        delete process.env.DENVIG_PROJECT_PATHS
      }
    })

    it('should override quickActions from DENVIG_QUICK_ACTIONS', async () => {
      const original = process.env.DENVIG_QUICK_ACTIONS
      process.env.DENVIG_QUICK_ACTIONS = 'build,test'

      const config = await getGlobalConfig()

      deepStrictEqual(config.quickActions, ['build', 'test'])

      // Restore
      if (original !== undefined) {
        process.env.DENVIG_QUICK_ACTIONS = original
      } else {
        delete process.env.DENVIG_QUICK_ACTIONS
      }
    })

    it('should disable quickActions with empty DENVIG_QUICK_ACTIONS', async () => {
      const original = process.env.DENVIG_QUICK_ACTIONS
      process.env.DENVIG_QUICK_ACTIONS = ''

      const config = await getGlobalConfig()

      deepStrictEqual(config.quickActions, [])

      // Restore
      if (original !== undefined) {
        process.env.DENVIG_QUICK_ACTIONS = original
      } else {
        delete process.env.DENVIG_QUICK_ACTIONS
      }
    })
  })
})

describe('getProjectConfig()', () => {
  it('should return empty config if no config file exists', async () => {
    const projectPath = '/tmp/test-project'
    const config = await getProjectConfig(projectPath)
    strictEqual(config.name, undefined)
    strictEqual(config.$sources.length, 0)
  })

  const writeConfig = (yaml: string): string => {
    const dir = mkdtempSync(`${tmpdir()}/denvig-config-`)
    writeFileSync(join(dir, '.denvig.yml'), yaml)
    return dir
  }

  it('loads a valid config', async () => {
    const dir = writeConfig(
      'name: T\nservices:\n  api:\n    command: echo hi\n',
    )
    try {
      const config = await getProjectConfig(dir)
      ok(config.services?.api)
      strictEqual(config.$sources.length, 1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('degrades to an empty config when a host service is missing its command', async () => {
    // The schema rejects a host service without a command (see config schema
    // tests and `config verify`). On the hot discovery path the loader degrades
    // gracefully and silently — it must not emit output here (shell completion
    // relies on this) — so the invalid config simply yields no services.
    const dir = writeConfig(
      'name: T\nservices:\n  broken:\n    http:\n      port: 9999\n',
    )
    try {
      const config = await getProjectConfig(dir)
      strictEqual(config.$sources.length, 0)
      strictEqual(config.services, undefined)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('accepts a docker service without a command', async () => {
    const dir = writeConfig(
      'name: T\nservices:\n  redis:\n    runtime: docker\n    image: redis:8.8\n',
    )
    try {
      const config = await getProjectConfig(dir)
      ok(config.services?.redis)
      strictEqual(config.$sources.length, 1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('getProjectConfig() with .denvig.local.yml', () => {
  const BASE = [
    'name: Base',
    'quickActions:',
    '  - build',
    '  - test',
    'actions:',
    '  build:',
    '    command: pnpm build',
    'services:',
    '  api:',
    '    command: pnpm dev',
    '    http:',
    '      port: 3000',
    '      domain: api.test',
    '    env:',
    '      A: "1"',
    '',
  ].join('\n')

  const withProject = async (
    files: { base?: string; local?: string },
    fn: (dir: string) => Promise<void>,
  ): Promise<void> => {
    const dir = mkdtempSync(`${tmpdir()}/denvig-local-config-`)
    try {
      if (files.base !== undefined)
        writeFileSync(join(dir, '.denvig.yml'), files.base)
      if (files.local !== undefined)
        writeFileSync(join(dir, '.denvig.local.yml'), files.local)
      await fn(dir)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  const assertBaseOnly = async (dir: string): Promise<void> => {
    const config = await getProjectConfig(dir)
    deepStrictEqual(config.$sources, [join(dir, '.denvig.yml')])
    strictEqual(config.name, 'Base')
    deepStrictEqual(config.quickActions, ['build', 'test'])
    deepStrictEqual(config.services?.api, {
      command: 'pnpm dev',
      http: { port: 3000, domain: 'api.test' },
      env: { A: '1' },
    })
  }

  it('overrides scalar values and records both sources', async () => {
    await withProject({ base: BASE, local: 'name: Local\n' }, async (dir) => {
      const config = await getProjectConfig(dir)
      strictEqual(config.name, 'Local')
      deepStrictEqual(config.$sources, [
        join(dir, '.denvig.yml'),
        join(dir, '.denvig.local.yml'),
      ])
    })
  })

  it('merges matching keys with existing values', async () => {
    const local = [
      'services:',
      '  api:',
      '    http:',
      '      port: 4000',
      '    env:',
      '      B: "2"',
      '',
    ].join('\n')
    await withProject({ base: BASE, local }, async (dir) => {
      const config = await getProjectConfig(dir)
      deepStrictEqual(config.services?.api, {
        command: 'pnpm dev',
        http: { port: 4000, domain: 'api.test' },
        env: { A: '1', B: '2' },
      })
      deepStrictEqual(config.actions, { build: { command: 'pnpm build' } })
    })
  })

  it('adds new entries to records and lists', async () => {
    const local = [
      'quickActions:',
      '  - test',
      '  - dev',
      'actions:',
      '  dev:',
      '    command: pnpm dev',
      'services:',
      '  worker:',
      '    command: pnpm worker',
      '',
    ].join('\n')
    await withProject({ base: BASE, local }, async (dir) => {
      const config = await getProjectConfig(dir)
      deepStrictEqual(config.quickActions, ['build', 'test', 'dev'])
      deepStrictEqual(Object.keys(config.actions ?? {}), ['build', 'dev'])
      deepStrictEqual(Object.keys(config.services ?? {}), ['api', 'worker'])
    })
  })

  it('removes keys that are set to null', async () => {
    const local = 'services:\n  api: null\n  worker:\n    command: w\n'
    await withProject({ base: BASE, local }, async (dir) => {
      const config = await getProjectConfig(dir)
      deepStrictEqual(Object.keys(config.services ?? {}), ['worker'])
    })
  })

  it('applies a local config when there is no committed config', async () => {
    await withProject(
      { local: 'name: Local\nservices:\n  api:\n    command: x\n' },
      async (dir) => {
        const config = await getProjectConfig(dir)
        strictEqual(config.name, 'Local')
        ok(config.services?.api)
        deepStrictEqual(config.$sources, [join(dir, '.denvig.local.yml')])
      },
    )
  })

  it('applies a local config on its own when the committed config is invalid', async () => {
    await withProject(
      { base: 'name: [unclosed\n', local: 'name: Local\n' },
      async (dir) => {
        const config = await getProjectConfig(dir)
        strictEqual(config.name, 'Local')
        deepStrictEqual(config.$sources, [join(dir, '.denvig.local.yml')])
      },
    )
  })

  it('strips unknown keys while still applying valid ones', async () => {
    const local = [
      'name: Local',
      'unknownKey: true',
      'services:',
      '  api:',
      '    notARealOption: yes',
      '',
    ].join('\n')
    await withProject({ base: BASE, local }, async (dir) => {
      const config = await getProjectConfig(dir)
      strictEqual(config.name, 'Local')
      strictEqual((config as Record<string, unknown>).unknownKey, undefined)
      strictEqual(
        (config.services?.api as Record<string, unknown> | undefined)
          ?.notARealOption,
        undefined,
      )
      strictEqual(config.services?.api.command, 'pnpm dev')
    })
  })

  const ignoredLocals: Record<string, string> = {
    'corrupted YAML': 'name: Local\nservices:\n  api: [unclosed\n',
    'bad indentation': 'name: Local\n  services:\n api:\n',
    'duplicate keys': 'name: Local\nname: Other\n',
    'tab indentation': 'services:\n\tapi:\n\t\tcommand: x\n',
    'binary garbage': '\u0000\u0001\u0002\uFFFD\u0007',
    'a top level list': '- name: Local\n',
    'a top level string': 'just some text\n',
    'a top level number': '42\n',
    'only comments': '# nothing here\n',
    'only whitespace': '   \n\n',
    'a null document': '~\n',
    'multiple documents': 'name: Local\n---\nname: Other\n',
    'an invalid service name': 'services:\n  Bad_Name:\n    command: x\n',
    'a wrong value type':
      'services:\n  api:\n    http:\n      port: "not a number"\n',
    'a list where a record is expected': 'services:\n  - api\n',
    'a string where a list is expected': 'quickActions: dev\n',
    'a record where a string is expected': 'name:\n  nested: true\n',
    'a removed required command': 'services:\n  api:\n    command: null\n',
    'a new host service without a command':
      'services:\n  web:\n    http:\n      port: 1\n',
    'an invalid runtime': 'services:\n  api:\n    runtime: vm\n',
    'an action without a command': 'actions:\n  dev: {}\n',
  }

  for (const [label, local] of Object.entries(ignoredLocals)) {
    it(`ignores a local config with ${label}`, async () => {
      await withProject({ base: BASE, local }, assertBaseOnly)
    })
  }

  it('ignores a local config that is a directory', async () => {
    await withProject({ base: BASE }, async (dir) => {
      mkdirSync(join(dir, '.denvig.local.yml'))
      await assertBaseOnly(dir)
    })
  })

  it('does not pollute prototypes from a local config', async () => {
    const local = [
      '__proto__:',
      '  polluted: true',
      'constructor:',
      '  prototype:',
      '    polluted: true',
      'services:',
      '  __proto__:',
      '    polluted: true',
      '',
    ].join('\n')
    await withProject({ base: BASE, local }, async (dir) => {
      const config = await getProjectConfig(dir)
      strictEqual(({} as Record<string, unknown>).polluted, undefined)
      deepStrictEqual(Object.keys(config.services ?? {}), ['api'])
    })
  })

  it('returns an empty config when only an invalid local config exists', async () => {
    await withProject(
      { local: 'services:\n  api:\n    cwd: x\n' },
      async (dir) => {
        const config = await getProjectConfig(dir)
        deepStrictEqual(config, { $sources: [] })
      },
    )
  })
})
