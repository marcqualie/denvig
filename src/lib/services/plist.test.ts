import { ok } from 'node:assert'
import { describe, it } from 'node:test'

import plist, { escapeXml, generatePlist } from './plist.ts'

describe('plist', () => {
  describe('generatePlist()', () => {
    it('should generate valid plist XML with all fields', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test-project.api',
        command: 'pnpm run dev',
        workingDirectory: '/Users/test/projects/test-project/apps/api',
        environmentVariables: {
          NODE_ENV: 'development',
          DEBUG: 'true',
        },
        standardOutPath: '/tmp/denvig-test-project-api.log',
        standardErrorPath: '/tmp/denvig-test-project-api.error.log',
        keepAlive: true,
      })

      ok(plistXml.includes('<?xml version="1.0" encoding="UTF-8"?>'))
      ok(plistXml.includes('<key>Label</key>'))
      ok(plistXml.includes('<string>com.denvig.test-project.api</string>'))
      ok(plistXml.includes('<key>ProgramArguments</key>'))
      ok(plistXml.includes('<string>/bin/zsh</string>'))
      ok(plistXml.includes('<string>-l</string>'))
      ok(plistXml.includes('<string>-c</string>'))
      ok(plistXml.includes('<string>pnpm run dev</string>'))
      ok(plistXml.includes('<key>WorkingDirectory</key>'))
      ok(plistXml.includes('<key>EnvironmentVariables</key>'))
      ok(plistXml.includes('<key>NODE_ENV</key>'))
      ok(plistXml.includes('<string>development</string>'))
      ok(plistXml.includes('<key>StandardOutPath</key>'))
      ok(plistXml.includes('<key>StandardErrorPath</key>'))
      ok(plistXml.includes('<key>KeepAlive</key>'))
      ok(plistXml.includes('<true/>'))
      ok(plistXml.includes('<key>RunAtLoad</key>'))
      ok(plistXml.includes('<false/>'))
    })

    it('should generate plist with minimal fields', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test.simple',
        command: 'node server.js',
        workingDirectory: '/tmp/test',
        standardOutPath: '/tmp/test.log',
        standardErrorPath: '/tmp/test.error.log',
        keepAlive: false,
      })

      ok(plistXml.includes('com.denvig.test.simple'))
      ok(plistXml.includes('node server.js'))
      ok(plistXml.includes('<key>EnvironmentVariables</key>'))
    })

    it('should escape special XML characters', () => {
      const plistXml = generatePlist({
        label: 'com.denvig.test.escape',
        command: 'echo "test & <script>" > file.txt',
        workingDirectory: '/tmp/test',
        environmentVariables: {
          TEST: 'value with & < > " \' chars',
        },
        standardOutPath: '/tmp/test.log',
        standardErrorPath: '/tmp/test.error.log',
        keepAlive: true,
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
        command: 'pnpm run dev',
        workingDirectory: '/tmp/test',
        environmentVariables: {
          PORT: '3000',
          NODE_ENV: 'development',
        },
        standardOutPath: '/tmp/test.log',
        standardErrorPath: '/tmp/test.error.log',
        keepAlive: true,
      })

      ok(plistXml.includes('<key>PORT</key>'))
      ok(plistXml.includes('<string>3000</string>'))
    })

    it('should work via default export', () => {
      const plistXml = plist.generatePlist({
        label: 'com.denvig.test.export',
        command: 'node app.js',
        workingDirectory: '/tmp/test',
        standardOutPath: '/tmp/test.log',
        standardErrorPath: '/tmp/test.error.log',
        keepAlive: true,
      })

      ok(plistXml.includes('com.denvig.test.export'))
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
})
