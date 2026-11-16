import { ok, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { generateSystemdUnit } from './systemdUnit.ts'

const baseOptions = {
  label: 'denvig.abc123.api',
  programPath: '/home/user/.denvig/services/abc123.api/denvig-api',
  workingDirectory: '/home/user/src/app',
  standardOutPath: '/home/user/.denvig/services/abc123.api/logs/latest.log',
  keepAlive: true,
  runAtLoad: false,
}

describe('generateSystemdUnit()', () => {
  it('renders a service section with exec, cwd and log paths', () => {
    const unit = generateSystemdUnit(baseOptions)

    ok(unit.includes('Description=Denvig service denvig.abc123.api'))
    ok(unit.includes(`ExecStart="${baseOptions.programPath}"`))
    ok(unit.includes(`WorkingDirectory=${baseOptions.workingDirectory}`))
    ok(unit.includes(`StandardOutput=append:${baseOptions.standardOutPath}`))
    ok(unit.includes(`StandardError=append:${baseOptions.standardOutPath}`))
  })

  it('restarts indefinitely when keepAlive is enabled', () => {
    const unit = generateSystemdUnit(baseOptions)

    ok(unit.includes('Restart=always'))
    ok(unit.includes('StartLimitIntervalSec=0'))
    ok(!unit.includes('RemainAfterExit'))
  })

  it('keeps one-shot services active after exit when keepAlive is disabled', () => {
    const unit = generateSystemdUnit({ ...baseOptions, keepAlive: false })

    ok(unit.includes('Restart=no'))
    ok(unit.includes('RemainAfterExit=yes'))
  })

  it('only adds an install section when the service starts on boot', () => {
    ok(!generateSystemdUnit(baseOptions).includes('[Install]'))

    const unit = generateSystemdUnit({ ...baseOptions, runAtLoad: true })
    ok(unit.includes('[Install]\nWantedBy=default.target'))
  })

  it('escapes quotes, backslashes, newlines and specifiers in environment values', () => {
    const unit = generateSystemdUnit({
      ...baseOptions,
      environmentVariables: {
        PORT: '3000',
        TRICKY: 'a "quoted" \\path\nwith 100% $HOME',
      },
    })

    ok(unit.includes('Environment="PORT=3000"'))
    ok(
      unit.includes(
        'Environment="TRICKY=a \\"quoted\\" \\\\path\\nwith 100%% $HOME"',
      ),
    )
  })

  it('escapes specifiers and variables in paths', () => {
    const unit = generateSystemdUnit({
      ...baseOptions,
      programPath: '/tmp/100%/$bin',
      workingDirectory: '/tmp/50%',
    })

    ok(unit.includes('ExecStart="/tmp/100%%/$$bin"'))
    ok(unit.includes('WorkingDirectory=/tmp/50%%'))
  })

  it('ends with a trailing newline', () => {
    strictEqual(generateSystemdUnit(baseOptions).endsWith('\n'), true)
  })
})
