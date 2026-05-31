import { deepStrictEqual, ok, strictEqual } from 'node:assert'
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
})
