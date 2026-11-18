import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { parseShowOutput, toPrintOutput, unitName } from './systemctl.ts'

describe('systemctl', () => {
  describe('unitName()', () => {
    it('appends the service suffix to a label', () => {
      strictEqual(unitName('denvig.abc.api'), 'denvig.abc.api.service')
    })
  })

  describe('parseShowOutput()', () => {
    it('parses one property map per unit', () => {
      const output = [
        'Id=denvig.abc.api.service',
        'ActiveState=active',
        'MainPID=1234',
        '',
        'Id=denvig.abc.worker.service',
        'ActiveState=failed',
        'ExecStart={ path=/bin/x ; argv[]=/bin/x a=b }',
        '',
      ].join('\n')

      deepStrictEqual(parseShowOutput(output), [
        {
          Id: 'denvig.abc.api.service',
          ActiveState: 'active',
          MainPID: '1234',
        },
        {
          Id: 'denvig.abc.worker.service',
          ActiveState: 'failed',
          ExecStart: '{ path=/bin/x ; argv[]=/bin/x a=b }',
        },
      ])
    })

    it('returns an empty list for empty output', () => {
      deepStrictEqual(parseShowOutput(''), [])
    })
  })

  describe('toPrintOutput()', () => {
    it('reports a running unit with its pid', () => {
      deepStrictEqual(
        toPrintOutput('denvig.abc.api', {
          LoadState: 'loaded',
          ActiveState: 'active',
          SubState: 'running',
          MainPID: '1234',
          ExecMainStatus: '0',
        }),
        {
          label: 'denvig.abc.api',
          pid: 1234,
          state: 'running',
          status: 'running',
          lastExitCode: 0,
        },
      )
    })

    it('treats a failed unit as loaded but not running', () => {
      deepStrictEqual(
        toPrintOutput('denvig.abc.api', {
          LoadState: 'loaded',
          ActiveState: 'failed',
          SubState: 'failed',
          MainPID: '0',
          ExecMainStatus: '1',
        }),
        {
          label: 'denvig.abc.api',
          pid: undefined,
          state: 'failed',
          status: 'failed',
          lastExitCode: 1,
        },
      )
    })

    it('treats an exited one-shot unit as loaded but not running', () => {
      strictEqual(
        toPrintOutput('denvig.abc.migrate', {
          LoadState: 'loaded',
          ActiveState: 'active',
          SubState: 'exited',
          MainPID: '0',
          ExecMainStatus: '0',
        })?.state,
        'exited',
      )
    })

    it('returns null for inactive or missing units', () => {
      strictEqual(
        toPrintOutput('denvig.abc.api', {
          LoadState: 'loaded',
          ActiveState: 'inactive',
          SubState: 'dead',
        }),
        null,
      )
      strictEqual(
        toPrintOutput('denvig.abc.api', {
          LoadState: 'not-found',
          ActiveState: 'inactive',
        }),
        null,
      )
    })
  })
})
