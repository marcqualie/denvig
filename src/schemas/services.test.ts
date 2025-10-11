import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import { ServiceConfigSchema, ServicesConfigSchema } from './services.ts'

describe('ServiceConfigSchema', () => {
  it('should parse valid service configuration', () => {
    const validConfig = {
      cwd: 'apps/api',
      command: 'pnpm run dev',
      port: 3000,
      domain: 'api.denvig.local',
      keepAlive: true,
      runAtLoad: false,
    }

    const result = ServiceConfigSchema.safeParse(validConfig)
    ok(result.success)
  })

  it('should parse minimal service configuration', () => {
    const minimalConfig = {
      command: 'pnpm run dev',
    }

    const result = ServiceConfigSchema.safeParse(minimalConfig)
    ok(result.success)
  })

  it('should parse service configuration with cwd', () => {
    const configWithCwd = {
      cwd: 'apps/api',
      command: 'pnpm run dev',
    }

    const result = ServiceConfigSchema.safeParse(configWithCwd)
    ok(result.success)
  })

  it('should reject configuration without required fields', () => {
    const invalidConfig = {
      port: 3000,
    }

    const result = ServiceConfigSchema.safeParse(invalidConfig)
    ok(!result.success)
  })

  it('should reject invalid field types', () => {
    const invalidConfig = {
      cwd: 'apps/api',
      command: 'pnpm run dev',
      port: 'not-a-number',
    }

    const result = ServiceConfigSchema.safeParse(invalidConfig)
    ok(!result.success)
  })
})

describe('ServicesConfigSchema', () => {
  it('should parse valid services configuration', () => {
    const validConfig = {
      api: {
        cwd: 'apps/api',
        command: 'pnpm run dev',
        port: 3000,
      },
      frontend: {
        cwd: 'apps/frontend',
        command: 'pnpm run dev',
        port: 3001,
      },
    }

    const result = ServicesConfigSchema.safeParse(validConfig)
    ok(result.success)
  })

  it('should parse empty services configuration', () => {
    const emptyConfig = {}

    const result = ServicesConfigSchema.safeParse(emptyConfig)
    ok(result.success)
  })
})
