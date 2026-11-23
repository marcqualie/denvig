import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'
import { parse } from 'yaml'

import { mergeConfig } from './mergeConfig.ts'

describe('mergeConfig()', () => {
  it('overrides scalar values', () => {
    deepStrictEqual(mergeConfig({ name: 'a' }, { name: 'b' }), { name: 'b' })
  })

  it('adds new keys alongside existing keys', () => {
    deepStrictEqual(
      mergeConfig(
        { actions: { build: { command: 'pnpm build' } } },
        { actions: { lint: { command: 'pnpm lint' } } },
      ),
      {
        actions: {
          build: { command: 'pnpm build' },
          lint: { command: 'pnpm lint' },
        },
      },
    )
  })

  it('merges matching keys deeply', () => {
    deepStrictEqual(
      mergeConfig(
        {
          services: {
            api: {
              command: 'pnpm dev',
              http: { port: 3000, domain: 'api.test' },
              env: { A: '1' },
            },
          },
        },
        { services: { api: { http: { port: 4000 }, env: { B: '2' } } } },
      ),
      {
        services: {
          api: {
            command: 'pnpm dev',
            http: { port: 4000, domain: 'api.test' },
            env: { A: '1', B: '2' },
          },
        },
      },
    )
  })

  it('appends new list entries without duplicating existing ones', () => {
    deepStrictEqual(
      mergeConfig(
        { quickActions: ['build', 'test'] },
        { quickActions: ['test', 'dev', 'dev'] },
      ),
      { quickActions: ['build', 'test', 'dev'] },
    )
  })

  it('dedupes object list entries by value', () => {
    deepStrictEqual(mergeConfig([{ a: 1 }], [{ a: 1 }, { a: 2 }]), [
      { a: 1 },
      { a: 2 },
    ])
  })

  it('ignores null list entries', () => {
    deepStrictEqual(mergeConfig(['a'], [null, 'b']), ['a', 'b'])
  })

  it('removes keys set to null', () => {
    deepStrictEqual(
      mergeConfig(
        {
          name: 'a',
          services: { api: { command: 'x' }, web: { command: 'y' } },
        },
        { services: { web: null } },
      ),
      { name: 'a', services: { api: { command: 'x' } } },
    )
  })

  it('strips nulls from brand new nested keys', () => {
    deepStrictEqual(
      mergeConfig({}, { services: { api: { command: 'x', cwd: null } } }),
      {
        services: { api: { command: 'x' } },
      },
    )
  })

  it('replaces values when the types do not match', () => {
    deepStrictEqual(
      mergeConfig({ quickActions: ['a'] }, { quickActions: 'b' }),
      {
        quickActions: 'b',
      },
    )
    deepStrictEqual(mergeConfig({ services: { a: {} } }, { services: ['x'] }), {
      services: ['x'],
    })
    deepStrictEqual(mergeConfig({ name: 'a' }, { name: { nested: true } }), {
      name: { nested: true },
    })
  })

  it('keeps the base when the override is undefined', () => {
    deepStrictEqual(mergeConfig({ name: 'a' }, undefined), { name: 'a' })
  })

  it('does not mutate its inputs', () => {
    const base = { quickActions: ['a'], services: { api: { env: { A: '1' } } } }
    const override = {
      quickActions: ['b'],
      services: { api: { env: { B: '2' } } },
    }
    const baseCopy = structuredClone(base)
    const overrideCopy = structuredClone(override)
    const result = mergeConfig(base, override) as typeof base
    result.quickActions.push('c')
    deepStrictEqual(base, baseCopy)
    deepStrictEqual(override, overrideCopy)
  })

  it('does not pollute prototypes from YAML input', () => {
    const override = parse(
      '__proto__:\n  polluted: true\nconstructor:\n  prototype:\n    polluted: true\nservices:\n  __proto__:\n    polluted: true\n',
    )
    const result = mergeConfig({ services: {} }, override) as Record<
      string,
      unknown
    >
    strictEqual(({} as Record<string, unknown>).polluted, undefined)
    strictEqual(Object.getPrototypeOf(result), Object.prototype)
    deepStrictEqual(Object.keys(result), ['services'])
    deepStrictEqual(result.services, {})
  })
})
