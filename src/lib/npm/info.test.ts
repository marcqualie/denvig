import assert from 'node:assert'
import { describe, it } from 'node:test'

import { getCacheFilePath, sanitizePackageName } from './info.ts'

describe('sanitizePackageName', () => {
  describe('basic npm package names', () => {
    it('should handle simple package names', () => {
      assert.strictEqual(sanitizePackageName('lodash'), 'lodash')
      assert.strictEqual(sanitizePackageName('react'), 'react')
      assert.strictEqual(sanitizePackageName('typescript'), 'typescript')
    })

    it('should handle hyphenated package names', () => {
      assert.strictEqual(sanitizePackageName('react-dom'), 'react-dom')
      assert.strictEqual(sanitizePackageName('lodash-es'), 'lodash-es')
    })

    it('should handle package names with dots', () => {
      assert.strictEqual(sanitizePackageName('socket.io'), 'socket.io')
    })

    it('should handle scoped packages', () => {
      assert.strictEqual(sanitizePackageName('@types/node'), '_at_types__node')
      assert.strictEqual(sanitizePackageName('@babel/core'), '_at_babel__core')
      assert.strictEqual(
        sanitizePackageName('@scope/package-name'),
        '_at_scope__package-name',
      )
    })
  })

  describe('path traversal attempts', () => {
    it('should neutralize .. path traversal', () => {
      const result = sanitizePackageName('../../../etc/passwd')
      assert.ok(!result.includes('..'), 'Should not contain ..')
      assert.ok(!result.includes('/'), 'Should not contain /')
    })

    it('should neutralize encoded path traversal', () => {
      const result = sanitizePackageName('..%2F..%2Fetc%2Fpasswd')
      assert.ok(!result.includes('..'), 'Should not contain ..')
      assert.ok(!result.includes('/'), 'Should not contain /')
    })

    it('should handle multiple consecutive dots', () => {
      const result = sanitizePackageName('....')
      assert.ok(!result.includes('..'), 'Should not contain ..')
    })

    it('should neutralize backslash path traversal', () => {
      const result = sanitizePackageName('..\\..\\windows\\system32')
      assert.ok(!result.includes('\\'), 'Should not contain backslash')
      assert.ok(!result.includes('..'), 'Should not contain ..')
    })
  })

  describe('special filesystem characters', () => {
    it('should handle forward slashes', () => {
      const result = sanitizePackageName('path/to/file')
      assert.ok(!result.includes('/'), 'Should not contain /')
    })

    it('should handle backslashes', () => {
      const result = sanitizePackageName('path\\to\\file')
      assert.ok(!result.includes('\\'), 'Should not contain backslash')
    })

    it('should handle null bytes', () => {
      const result = sanitizePackageName('package\x00name')
      assert.ok(!result.includes('\x00'), 'Should not contain null byte')
    })

    it('should handle newlines and control characters', () => {
      const result = sanitizePackageName('package\nname\r\t')
      assert.ok(!result.includes('\n'), 'Should not contain newline')
      assert.ok(!result.includes('\r'), 'Should not contain carriage return')
      assert.ok(!result.includes('\t'), 'Should not contain tab')
    })

    it('should handle asterisk (glob)', () => {
      const result = sanitizePackageName('package*')
      assert.ok(!result.includes('*'), 'Should not contain asterisk')
    })

    it('should handle question mark (glob)', () => {
      const result = sanitizePackageName('package?name')
      assert.ok(!result.includes('?'), 'Should not contain question mark')
    })

    it('should handle angle brackets', () => {
      const result = sanitizePackageName('package<name>')
      assert.ok(!result.includes('<'), 'Should not contain <')
      assert.ok(!result.includes('>'), 'Should not contain >')
    })

    it('should handle pipe character', () => {
      const result = sanitizePackageName('package|name')
      assert.ok(!result.includes('|'), 'Should not contain pipe')
    })

    it('should handle colon', () => {
      const result = sanitizePackageName('package:name')
      assert.ok(!result.includes(':'), 'Should not contain colon')
    })

    it('should handle double quotes', () => {
      const result = sanitizePackageName('package"name"')
      assert.ok(!result.includes('"'), 'Should not contain double quote')
    })

    it('should handle single quotes', () => {
      const result = sanitizePackageName("package'name")
      assert.ok(!result.includes("'"), 'Should not contain single quote')
    })
  })

  describe('hidden files and special patterns', () => {
    it('should not produce hidden files (leading dot)', () => {
      const result = sanitizePackageName('.hidden')
      assert.ok(!result.startsWith('.'), 'Should not start with dot')
    })

    it('should handle multiple leading dots', () => {
      const result = sanitizePackageName('...hidden')
      assert.ok(!result.startsWith('.'), 'Should not start with dot')
    })
  })

  describe('unicode and non-ASCII characters', () => {
    it('should handle unicode package names', () => {
      const result = sanitizePackageName('пакет')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })

    it('should handle emoji', () => {
      const result = sanitizePackageName('package📦name')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })

    it('should handle Chinese characters', () => {
      const result = sanitizePackageName('包名')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })

    it('should handle mixed unicode and ASCII', () => {
      const result = sanitizePackageName('package-名前-test')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })

    it('should handle zero-width characters', () => {
      const result = sanitizePackageName('pack\u200Bage')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })

    it('should handle right-to-left override', () => {
      const result = sanitizePackageName('package\u202Ename')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })
  })

  describe('edge cases', () => {
    it('should handle empty string', () => {
      const result = sanitizePackageName('')
      assert.ok(result.length > 0, 'Should not be empty')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })

    it('should handle string of only special characters', () => {
      const result = sanitizePackageName('!@#$%^&*()')
      assert.ok(result.length > 0, 'Should not be empty')
      assert.ok(/^[a-zA-Z0-9\-_.]+$/.test(result), 'Should only contain ASCII')
    })

    it('should handle very long package names', () => {
      const longName = 'a'.repeat(500)
      const result = sanitizePackageName(longName)
      assert.ok(result.length <= 200, 'Should truncate long names')
    })

    it('should handle spaces', () => {
      const result = sanitizePackageName('package name with spaces')
      assert.ok(!result.includes(' '), 'Should not contain spaces')
    })

    it('should handle numbers at start', () => {
      const result = sanitizePackageName('123package')
      assert.strictEqual(result, '123package')
    })

    it('should handle underscore-only names', () => {
      const result = sanitizePackageName('___')
      assert.ok(result.length > 0, 'Should not be empty')
    })
  })

  describe('SQL injection and command injection patterns', () => {
    it('should neutralize SQL injection attempts', () => {
      const result = sanitizePackageName("'; DROP TABLE packages; --")
      assert.ok(!result.includes("'"), 'Should not contain single quote')
      assert.ok(!result.includes(';'), 'Should not contain semicolon')
    })

    it('should neutralize command injection attempts', () => {
      const result = sanitizePackageName('$(whoami)')
      assert.ok(!result.includes('$'), 'Should not contain $')
      assert.ok(!result.includes('('), 'Should not contain (')
      assert.ok(!result.includes(')'), 'Should not contain )')
    })

    it('should neutralize backtick command injection', () => {
      const result = sanitizePackageName('`whoami`')
      assert.ok(!result.includes('`'), 'Should not contain backtick')
    })
  })

  describe('output is always safe for filesystem', () => {
    const testCases = [
      'lodash',
      '@types/node',
      '../../../etc/passwd',
      '..\\..\\windows\\system32',
      '.hidden',
      'package\x00name',
      'package\nname',
      'пакет',
      '📦',
      '',
      '!@#$%^&*()',
      'a'.repeat(500),
      "'; DROP TABLE --",
      '$(whoami)',
      '`rm -rf /`',
    ]

    for (const input of testCases) {
      it(`should produce safe filename for: ${JSON.stringify(input).slice(0, 30)}`, () => {
        const result = sanitizePackageName(input)

        // Must not be empty
        assert.ok(result.length > 0, 'Result should not be empty')

        // Must only contain safe ASCII characters
        assert.ok(
          /^[a-zA-Z0-9\-_.]+$/.test(result),
          `Result "${result}" should only contain safe ASCII chars`,
        )

        // Must not contain path separators
        assert.ok(!result.includes('/'), 'Should not contain /')
        assert.ok(!result.includes('\\'), 'Should not contain \\')

        // Must not be a path traversal
        assert.ok(!result.includes('..'), 'Should not contain ..')

        // Must not start with dot (hidden file)
        assert.ok(!result.startsWith('.'), 'Should not start with .')

        // Must be reasonable length
        assert.ok(result.length <= 200, 'Should be reasonable length')
      })
    }
  })
})

describe('getCacheFilePath', () => {
  it('should return a path ending in .json', async () => {
    const result = await getCacheFilePath('lodash')
    assert.ok(result.endsWith('.json'), 'Should end with .json')
  })

  it('should include the sanitized package name', async () => {
    const result = await getCacheFilePath('lodash')
    assert.ok(result.includes('lodash'), 'Should include package name')
  })

  it('should handle scoped packages', async () => {
    const result = await getCacheFilePath('@types/node')
    assert.ok(
      result.includes('_at_types__node'),
      'Should include sanitized scoped name',
    )
  })

  it('should produce safe paths for malicious input', async () => {
    const result = await getCacheFilePath('../../../etc/passwd')
    assert.ok(!result.includes('../'), 'Should not allow path traversal')
    assert.ok(result.endsWith('.json'), 'Should still end with .json')
  })
})
