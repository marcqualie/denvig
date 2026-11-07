import { deepStrictEqual, strictEqual } from 'node:assert'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import {
  isReleaseAgeExcluded,
  readPnpmReleaseAgeConfig,
} from './pnpm-config.ts'

const withWorkspace = async (
  yaml: string | null,
  fn: (dir: string) => Promise<void>,
) => {
  const dir = await mkdtemp(join(tmpdir(), 'denvig-pnpm-config-'))
  try {
    if (yaml !== null) {
      await writeFile(join(dir, 'pnpm-workspace.yaml'), yaml)
    }
    await fn(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

describe('readPnpmReleaseAgeConfig()', () => {
  it('should return null when pnpm-workspace.yaml is missing', async () => {
    await withWorkspace(null, async (dir) => {
      strictEqual(await readPnpmReleaseAgeConfig(dir), null)
    })
  })

  it('should read minimumReleaseAge as minutes', async () => {
    await withWorkspace(
      'minimumReleaseAge: 1440\nminimumReleaseAgeExclude:\n  - react\n',
      async (dir) => {
        deepStrictEqual(await readPnpmReleaseAgeConfig(dir), {
          minimumReleaseAgeMs: 24 * 60 * 60 * 1000,
          exclude: ['react'],
        })
      },
    )
  })

  it('should keep the exclude list when minimumReleaseAge is not set', async () => {
    await withWorkspace(
      "minimumReleaseAgeExclude:\n  - denvig\n  - '@astrojs/starlight@0.41.4'\n",
      async (dir) => {
        deepStrictEqual(await readPnpmReleaseAgeConfig(dir), {
          minimumReleaseAgeMs: null,
          exclude: ['denvig', '@astrojs/starlight@0.41.4'],
        })
      },
    )
  })
})

describe('isReleaseAgeExcluded()', () => {
  it('should match exact package names', () => {
    strictEqual(isReleaseAgeExcluded(['denvig'], 'denvig', '0.7.7'), true)
    strictEqual(isReleaseAgeExcluded(['denvig'], 'denvig-cli', '0.7.7'), false)
  })

  it('should match glob patterns', () => {
    strictEqual(
      isReleaseAgeExcluded(['@denvig/*'], '@denvig/cli', '1.0.0'),
      true,
    )
    strictEqual(isReleaseAgeExcluded(['@denvig/*'], 'denvig', '1.0.0'), false)
  })

  it('should match version-pinned entries only for that version', () => {
    const exclude = ['@astrojs/starlight@0.41.4', 'nx@21.6.5 || 21.6.6']
    strictEqual(
      isReleaseAgeExcluded(exclude, '@astrojs/starlight', '0.41.4'),
      true,
    )
    strictEqual(
      isReleaseAgeExcluded(exclude, '@astrojs/starlight', '0.41.5'),
      false,
    )
    strictEqual(isReleaseAgeExcluded(exclude, 'nx', '21.6.6'), true)
    strictEqual(isReleaseAgeExcluded(exclude, 'nx', '21.6.7'), false)
  })
})
