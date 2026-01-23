import { deepStrictEqual, ok, rejects } from 'node:assert'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, it } from 'node:test'

import { loadEnvFiles, parseEnvContent, parseEnvFile } from './env.ts'

describe('parseEnvContent()', () => {
  it('should parse basic KEY=VALUE format', () => {
    const content = 'KEY1=value1\nKEY2=value2'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })
  })

  it('should handle empty lines', () => {
    const content = 'KEY1=value1\n\nKEY2=value2'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })
  })

  it('should handle comments', () => {
    const content =
      '# This is a comment\nKEY1=value1\n# Another comment\nKEY2=value2'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })
  })

  it('should handle double quoted values', () => {
    const content = 'KEY1="value with spaces"'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value with spaces',
    })
  })

  it('should handle single quoted values', () => {
    const content = "KEY1='value with spaces'"
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value with spaces',
    })
  })

  it('should handle values with special characters', () => {
    const content = 'DATABASE_URL=postgres://user:pass@localhost:5432/db'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      DATABASE_URL: 'postgres://user:pass@localhost:5432/db',
    })
  })

  it('should handle empty values', () => {
    const content = 'KEY1=\nKEY2=value2'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: '',
      KEY2: 'value2',
    })
  })

  it('should handle keys with underscores', () => {
    const content = 'MY_KEY_NAME=value'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      MY_KEY_NAME: 'value',
    })
  })

  it('should handle values with equals signs', () => {
    const content = 'KEY1=value=with=equals'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value=with=equals',
    })
  })

  it('should skip lines without equals sign', () => {
    const content = 'KEY1=value1\nINVALID LINE\nKEY2=value2'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })
  })

  it('should trim whitespace around keys and values', () => {
    const content = '  KEY1  =  value1  \n  KEY2=value2  '
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })
  })

  it('should strip inline comments from unquoted values', () => {
    const content = 'KEY=VALUE # this is a comment'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY: 'VALUE',
    })
  })

  it('should strip inline comments without space before #', () => {
    const content = 'KEY=VALUE#comment'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY: 'VALUE',
    })
  })

  it('should preserve # in double quoted values', () => {
    const content = 'KEY="VALUE # not a comment"'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY: 'VALUE # not a comment',
    })
  })

  it('should preserve # in single quoted values', () => {
    const content = "KEY='VALUE # not a comment'"
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY: 'VALUE # not a comment',
    })
  })

  it('should handle URL with fragment in quoted value', () => {
    const content = 'URL="https://example.com/path#fragment"'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      URL: 'https://example.com/path#fragment',
    })
  })

  it('should strip comment from URL without quotes', () => {
    const content = 'URL=https://example.com/path # API endpoint'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      URL: 'https://example.com/path',
    })
  })

  it('should handle multiple inline comments', () => {
    const content = 'KEY1=value1 # comment1\nKEY2=value2 # comment2'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })
  })

  it('should strip comment after double quoted value', () => {
    const content = 'KEY="value" # this is a comment'
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY: 'value',
    })
  })

  it('should strip comment after single quoted value', () => {
    const content = "KEY='value' # this is a comment"
    const result = parseEnvContent(content)

    deepStrictEqual(result, {
      KEY: 'value',
    })
  })
})

describe('parseEnvFile()', () => {
  it('should read and parse a .env file', async () => {
    const testDir = join(tmpdir(), `denvig-test-${Date.now()}`)
    const envFile = join(testDir, '.env')

    await mkdir(testDir, { recursive: true })
    await writeFile(envFile, 'KEY1=value1\nKEY2=value2', 'utf-8')

    const result = await parseEnvFile(envFile)

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })

    // Cleanup
    await rm(testDir, { recursive: true, force: true })
  })

  it('should throw error for non-existent file', async () => {
    const nonExistentFile = join(tmpdir(), 'non-existent-file.env')

    await rejects(
      async () => await parseEnvFile(nonExistentFile),
      (error: Error) => {
        ok(error.message.includes('not found'))
        return true
      },
    )
  })
})

describe('loadEnvFiles()', () => {
  it('should return empty object for empty array', async () => {
    const result = await loadEnvFiles([])

    deepStrictEqual(result, {})
  })

  it('should load a single env file', async () => {
    const testDir = join(tmpdir(), `denvig-test-${Date.now()}`)
    const envFile = join(testDir, '.env')

    await mkdir(testDir, { recursive: true })
    await writeFile(envFile, 'KEY1=value1\nKEY2=value2', 'utf-8')

    const result = await loadEnvFiles([envFile])

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
    })

    await rm(testDir, { recursive: true, force: true })
  })

  it('should merge multiple env files', async () => {
    const testDir = join(tmpdir(), `denvig-test-${Date.now()}`)
    const envFile1 = join(testDir, '.env')
    const envFile2 = join(testDir, '.env.local')

    await mkdir(testDir, { recursive: true })
    await writeFile(envFile1, 'KEY1=value1\nKEY2=value2', 'utf-8')
    await writeFile(envFile2, 'KEY3=value3', 'utf-8')

    const result = await loadEnvFiles([envFile1, envFile2])

    deepStrictEqual(result, {
      KEY1: 'value1',
      KEY2: 'value2',
      KEY3: 'value3',
    })

    await rm(testDir, { recursive: true, force: true })
  })

  it('should override keys from earlier files with later files', async () => {
    const testDir = join(tmpdir(), `denvig-test-${Date.now()}`)
    const envFile1 = join(testDir, '.env')
    const envFile2 = join(testDir, '.env.local')

    await mkdir(testDir, { recursive: true })
    await writeFile(
      envFile1,
      'DATABASE_URL=postgres://localhost/dev\nAPI_KEY=default-key\nDEBUG=false',
      'utf-8',
    )
    await writeFile(envFile2, 'API_KEY=local-secret-key\nDEBUG=true', 'utf-8')

    const result = await loadEnvFiles([envFile1, envFile2])

    deepStrictEqual(result, {
      DATABASE_URL: 'postgres://localhost/dev', // Only in first file
      API_KEY: 'local-secret-key', // Overridden by second file
      DEBUG: 'true', // Overridden by second file
    })

    await rm(testDir, { recursive: true, force: true })
  })

  it('should process files in order with last file winning', async () => {
    const testDir = join(tmpdir(), `denvig-test-${Date.now()}`)
    const envFile1 = join(testDir, '.env')
    const envFile2 = join(testDir, '.env.local')
    const envFile3 = join(testDir, '.env.override')

    await mkdir(testDir, { recursive: true })
    await writeFile(envFile1, 'KEY=first', 'utf-8')
    await writeFile(envFile2, 'KEY=second', 'utf-8')
    await writeFile(envFile3, 'KEY=third', 'utf-8')

    const result = await loadEnvFiles([envFile1, envFile2, envFile3])

    deepStrictEqual(result, {
      KEY: 'third', // Last file wins
    })

    await rm(testDir, { recursive: true, force: true })
  })

  it('should throw error if any file does not exist', async () => {
    const testDir = join(tmpdir(), `denvig-test-${Date.now()}`)
    const envFile1 = join(testDir, '.env')
    const nonExistentFile = join(testDir, '.env.missing')

    await mkdir(testDir, { recursive: true })
    await writeFile(envFile1, 'KEY=value', 'utf-8')

    await rejects(
      async () => await loadEnvFiles([envFile1, nonExistentFile]),
      (error: Error) => {
        ok(error.message.includes('not found'))
        return true
      },
    )

    await rm(testDir, { recursive: true, force: true })
  })
})
