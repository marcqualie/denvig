import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { GlobalConfigSchema, ProjectConfigSchema } from './config.ts'

describe('GlobalConfigSchema', () => {
  it('should parse valid global configuration', () => {
    const validConfig = {
      codeRootDir: '~/code',
      quickActions: ['build', 'test', 'lint'],
    }

    const result = GlobalConfigSchema.safeParse(validConfig)
    ok(result.success)
  })

  it('should parse minimal global configuration with defaults', () => {
    const minimalConfig = {}

    const result = GlobalConfigSchema.safeParse(minimalConfig)
    ok(result.success)
  })

  it('should apply default codeRootDir', () => {
    const config = {}

    const result = GlobalConfigSchema.safeParse(config)
    ok(result.success)
    if (result.success) {
      ok(result.data.codeRootDir === '~/src')
    }
  })

  it('should apply default quickActions', () => {
    const config = {}

    const result = GlobalConfigSchema.safeParse(config)
    ok(result.success)
    if (result.success) {
      ok(Array.isArray(result.data.quickActions))
      ok(result.data.quickActions.includes('build'))
    }
  })
})

describe('ProjectConfigSchema', () => {
  it('should parse valid project configuration', () => {
    const validConfig = {
      name: 'my-project',
      actions: {
        build: {
          command: 'pnpm build',
        },
        test: {
          command: 'pnpm test',
        },
      },
      quickActions: ['build', 'test'],
    }

    const result = ProjectConfigSchema.safeParse(validConfig)
    ok(result.success)
  })

  it('should parse minimal project configuration', () => {
    const minimalConfig = {
      name: 'my-project',
    }

    const result = ProjectConfigSchema.safeParse(minimalConfig)
    ok(result.success)
  })

  it('should reject configuration without name', () => {
    const invalidConfig = {
      actions: {
        build: {
          command: 'pnpm build',
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(invalidConfig)
    ok(!result.success)
  })
})

describe('ProjectConfigSchema - services', () => {
  it('should parse valid service configuration', () => {
    const validConfig = {
      name: 'my-project',
      services: {
        api: {
          cwd: 'apps/api',
          command: 'pnpm run dev',
          http: {
            port: 3000,
            domain: 'api.denvig.local',
          },
          keepAlive: true,
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(validConfig)
    ok(result.success)
  })

  it('should parse minimal service configuration', () => {
    const minimalConfig = {
      name: 'my-project',
      services: {
        api: {
          command: 'pnpm run dev',
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(minimalConfig)
    ok(result.success)
  })

  it('should parse service configuration with cwd', () => {
    const configWithCwd = {
      name: 'my-project',
      services: {
        api: {
          cwd: 'apps/api',
          command: 'pnpm run dev',
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(configWithCwd)
    ok(result.success)
  })

  it('should parse service configuration with envFiles', () => {
    const configWithEnvFiles = {
      name: 'my-project',
      services: {
        api: {
          command: 'pnpm run dev',
          envFiles: ['.env', '.env.local'],
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(configWithEnvFiles)
    ok(result.success)
  })

  it('should parse service configuration with env variables', () => {
    const configWithEnv = {
      name: 'my-project',
      services: {
        api: {
          command: 'pnpm run dev',
          env: {
            NODE_ENV: 'development',
            API_KEY: 'secret',
          },
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(configWithEnv)
    ok(result.success)
  })

  it('should parse service configuration with both envFiles and env', () => {
    const configWithBoth = {
      name: 'my-project',
      services: {
        api: {
          command: 'pnpm run dev',
          envFiles: ['.env', '.env.local'],
          env: {
            NODE_ENV: 'development',
          },
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(configWithBoth)
    ok(result.success)
  })

  it('should reject service configuration without required fields', () => {
    const invalidConfig = {
      name: 'my-project',
      services: {
        api: {
          http: {
            port: 3000,
          },
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(invalidConfig)
    ok(!result.success)
  })

  it('should reject invalid field types in service', () => {
    const invalidConfig = {
      name: 'my-project',
      services: {
        api: {
          cwd: 'apps/api',
          command: 'pnpm run dev',
          http: {
            port: 'not-a-number',
          },
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(invalidConfig)
    ok(!result.success)
  })

  it('should parse multiple services configuration', () => {
    const validConfig = {
      name: 'my-project',
      services: {
        api: {
          cwd: 'apps/api',
          command: 'pnpm run dev',
          http: {
            port: 3000,
          },
        },
        frontend: {
          cwd: 'apps/frontend',
          command: 'pnpm run dev',
          http: {
            port: 3001,
          },
        },
      },
    }

    const result = ProjectConfigSchema.safeParse(validConfig)
    ok(result.success)
  })

  it('should parse empty services configuration', () => {
    const emptyConfig = {
      name: 'my-project',
      services: {},
    }

    const result = ProjectConfigSchema.safeParse(emptyConfig)
    ok(result.success)
  })
})
