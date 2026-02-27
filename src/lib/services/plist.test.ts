import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import plist, {
  escapeForSingleQuote,
  escapeXml,
  generatePlist,
  generateServiceScript,
  wrapCommandWithTimestamp,
} from './plist.ts'

describe('plist', () => {
  describe('generatePlist()', () => {
    it('should generate valid plist XML with all fields', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test-project.api',
        programPath:
          '/Users/test/.denvig/services/abc123.api/denvig-owner-repo-api',
        workingDirectory: '/Users/test/projects/test-project/apps/api',
        environmentVariables: {
          NODE_ENV: 'development',
          DEBUG: 'true',
        },
        standardOutPath: '/tmp/denvig-test-project-api.log',
        keepAlive: true,
        runAtLoad: false,
      })

      ok(plistXml.includes('<?xml version="1.0" encoding="UTF-8"?>'))
      ok(plistXml.includes('<key>Label</key>'))
      ok(plistXml.includes('<string>com.denvig.test-project.api</string>'))
      ok(plistXml.includes('<key>ProgramArguments</key>'))
      // Should reference the script path, not zsh directly
      ok(
        plistXml.includes(
          '<string>/Users/test/.denvig/services/abc123.api/denvig-owner-repo-api</string>',
        ),
      )
      ok(!plistXml.includes('<string>/bin/zsh</string>'))
      ok(plistXml.includes('<key>WorkingDirectory</key>'))
      ok(plistXml.includes('<key>EnvironmentVariables</key>'))
      ok(plistXml.includes('<key>NODE_ENV</key>'))
      ok(plistXml.includes('<string>development</string>'))
      ok(plistXml.includes('<key>StandardOutPath</key>'))
      ok(!plistXml.includes('<key>StandardErrorPath</key>'))
      ok(plistXml.includes('<key>KeepAlive</key>'))
      ok(plistXml.includes('<true/>'))
      ok(plistXml.includes('<key>RunAtLoad</key>'))
      ok(plistXml.includes('<false/>'))
    })

    it('should set RunAtLoad to true when runAtLoad option is true', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test.startonboot',
        programPath: '/tmp/denvig-test',
        workingDirectory: '/tmp/test',
        standardOutPath: '/tmp/test.log',
        keepAlive: true,
        runAtLoad: true,
      })

      ok(plistXml.includes('<key>RunAtLoad</key>'))
      ok(plistXml.includes('<key>RunAtLoad</key>\n  <true/>'))
    })

    it('should generate plist with minimal fields', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test.simple',
        programPath: '/tmp/denvig-simple',
        workingDirectory: '/tmp/test',
        standardOutPath: '/tmp/test.log',
        keepAlive: false,
        runAtLoad: false,
      })

      ok(plistXml.includes('com.denvig.test.simple'))
      ok(plistXml.includes('denvig-simple'))
      ok(plistXml.includes('<key>EnvironmentVariables</key>'))
    })

    it('should escape special XML characters', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test.escape',
        programPath: '/tmp/denvig-escape',
        workingDirectory: '/tmp/test',
        environmentVariables: {
          TEST: 'value with & < > " \' chars',
        },
        standardOutPath: '/tmp/test.log',
        keepAlive: true,
        runAtLoad: false,
      })

      ok(plistXml.includes('&amp;'))
      ok(plistXml.includes('&lt;'))
      ok(plistXml.includes('&gt;'))
      ok(plistXml.includes('&quot;'))
      ok(plistXml.includes('&apos;'))
    })

    it('should include PORT environment variable when provided', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test-project.api',
        programPath: '/tmp/denvig-owner-repo-api',
        workingDirectory: '/tmp/test',
        environmentVariables: {
          PORT: '3000',
          NODE_ENV: 'development',
        },
        standardOutPath: '/tmp/test.log',
        keepAlive: true,
        runAtLoad: false,
      })

      ok(plistXml.includes('<key>PORT</key>'))
      ok(plistXml.includes('<string>3000</string>'))
    })

    it('should work via default export', () => {
      const plistXml = plist.generatePlist({
        label: 'com.denvig.test.export',
        programPath: '/tmp/denvig-export',
        workingDirectory: '/tmp/test',
        standardOutPath: '/tmp/test.log',
        keepAlive: true,
        runAtLoad: false,
      })

      ok(plistXml.includes('com.denvig.test.export'))
    })
  })

  describe('wrapCommandWithTimestamp()', () => {
    it('should wrap command with timestamp injection', () => {
      const wrapped = wrapCommandWithTimestamp('pnpm run dev')

      ok(wrapped.includes('{ pnpm run dev; }'))
      ok(wrapped.includes('2>&1'))
      ok(wrapped.includes('while IFS= read -r line'))
      ok(wrapped.includes('date -u +%Y-%m-%dT%H:%M:%SZ'))
    })

    it('should trim whitespace from command', () => {
      const wrapped = wrapCommandWithTimestamp('  node server.js  ')

      ok(wrapped.includes('{ node server.js; }'))
      ok(!wrapped.includes('  node'))
    })

    it('should work via default export', () => {
      const wrapped = plist.wrapCommandWithTimestamp('echo test')

      ok(wrapped.includes('{ echo test; }'))
      ok(wrapped.includes('while IFS= read -r line'))
    })
  })

  describe('escapeXml()', () => {
    it('should escape ampersand', () => {
      ok(escapeXml('foo & bar') === 'foo &amp; bar')
    })

    it('should escape less than', () => {
      ok(escapeXml('foo < bar') === 'foo &lt; bar')
    })

    it('should escape greater than', () => {
      ok(escapeXml('foo > bar') === 'foo &gt; bar')
    })

    it('should escape double quotes', () => {
      ok(escapeXml('foo "bar"') === 'foo &quot;bar&quot;')
    })

    it('should escape single quotes', () => {
      ok(escapeXml("foo 'bar'") === 'foo &apos;bar&apos;')
    })

    it('should escape multiple special characters', () => {
      const result = escapeXml('test & <script>"alert"</script>')
      ok(result.includes('&amp;'))
      ok(result.includes('&lt;'))
      ok(result.includes('&gt;'))
      ok(result.includes('&quot;'))
    })

    it('should work via default export', () => {
      ok(plist.escapeXml('test & value') === 'test &amp; value')
    })
  })

  describe('escapeForSingleQuote()', () => {
    it('should escape single quotes', () => {
      ok(escapeForSingleQuote("it's") === "it'\\''s")
    })

    it('should leave strings without single quotes unchanged', () => {
      ok(escapeForSingleQuote('hello world') === 'hello world')
    })

    it('should handle multiple single quotes', () => {
      ok(escapeForSingleQuote("a'b'c") === "a'\\''b'\\''c")
    })
  })

  describe('generateServiceScript()', () => {
    const defaultOpts = {
      command: 'pnpm run dev',
      serviceName: 'api',
      projectPath: '/Users/test/projects/my-app',
      projectSlug: 'github:owner/repo',
      workingDirectory: '/Users/test/projects/my-app',
    }

    it('should generate a bash script with shebang', () => {
      const script = generateServiceScript(defaultOpts)

      ok(script.startsWith('#!/bin/bash\n'))
    })

    it('should exec zsh with login shell', () => {
      const script = generateServiceScript(defaultOpts)

      ok(script.includes("exec /bin/zsh -l -c '"))
    })

    it('should include the wrapped command with timestamps', () => {
      const script = generateServiceScript(defaultOpts)

      ok(script.includes('pnpm run dev'))
      ok(script.includes('while IFS= read -r line'))
      ok(script.includes('date -u'))
    })

    it('should escape single quotes in the command', () => {
      const script = generateServiceScript({
        ...defaultOpts,
        command: "echo 'hello'",
      })

      ok(script.includes("echo '\\''hello'\\''"))
    })

    it('should include metadata comments', () => {
      const script = generateServiceScript(defaultOpts)

      ok(script.includes('# Service: api'))
      ok(script.includes('# Project: github:owner/repo'))
      ok(script.includes('# Path:    /Users/test/projects/my-app'))
      ok(script.includes('# Command: pnpm run dev'))
      ok(script.includes('# Workdir: /Users/test/projects/my-app'))
    })

    it('should work via default export', () => {
      const script = plist.generateServiceScript(defaultOpts)

      ok(script.startsWith('#!/bin/bash\n'))
      ok(script.includes('exec /bin/zsh -l -c'))
    })
  })
})
