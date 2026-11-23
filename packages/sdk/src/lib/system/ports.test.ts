import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import {
  classifyAddress,
  parseLsofListeners,
  parseProcessTable,
  parseSsListeners,
  processAncestry,
  resolveInterfaceName,
  splitHostPort,
  widestScope,
} from './ports.ts'

describe('splitHostPort()', () => {
  it('splits IPv4, IPv6 and wildcard addresses', () => {
    deepStrictEqual(splitHostPort('127.0.0.1:5432'), {
      address: '127.0.0.1',
      port: 5432,
    })
    deepStrictEqual(splitHostPort('[::1]:6379'), { address: '::1', port: 6379 })
    deepStrictEqual(splitHostPort('*:80'), { address: '*', port: 80 })
  })

  it('returns null for unparseable values', () => {
    strictEqual(splitHostPort('nope'), null)
    strictEqual(splitHostPort('*:*'), null)
  })
})

describe('classifyAddress()', () => {
  it('classifies wildcard addresses as all', () => {
    for (const address of ['*', '0.0.0.0', '::']) {
      strictEqual(classifyAddress(address), 'all')
    }
  })

  it('classifies loopback addresses', () => {
    for (const address of [
      '127.0.0.1',
      '127.0.0.53%lo',
      '::1',
      '::ffff:127.0.0.1',
    ]) {
      strictEqual(classifyAddress(address), 'loopback')
    }
  })

  it('classifies specific interface addresses as network', () => {
    strictEqual(classifyAddress('192.168.1.10'), 'network')
    strictEqual(classifyAddress('fe80::1%en0'), 'network')
  })
})

describe('widestScope()', () => {
  it('picks the most exposed scope', () => {
    strictEqual(widestScope(['loopback', 'all']), 'all')
    strictEqual(widestScope(['loopback', 'network']), 'network')
    strictEqual(widestScope(['loopback']), 'loopback')
  })
})

describe('resolveInterfaceName()', () => {
  const interfaces = {
    lo0: [
      {
        address: '127.0.0.1',
        netmask: '255.0.0.0',
        family: 'IPv4' as const,
        mac: '00:00:00:00:00:00',
        internal: true,
        cidr: '127.0.0.1/8',
      },
    ],
    en0: [
      {
        address: '192.168.1.10',
        netmask: '255.255.255.0',
        family: 'IPv4' as const,
        mac: '00:00:00:00:00:01',
        internal: false,
        cidr: '192.168.1.10/24',
      },
    ],
  }

  it('maps addresses to interface names', () => {
    strictEqual(resolveInterfaceName('127.0.0.1', interfaces), 'lo0')
    strictEqual(resolveInterfaceName('192.168.1.10', interfaces), 'en0')
  })

  it('uses the zone id when present', () => {
    strictEqual(resolveInterfaceName('fe80::1%en1', interfaces), 'en1')
  })

  it('returns null for wildcard and unknown addresses', () => {
    strictEqual(resolveInterfaceName('*', interfaces), null)
    strictEqual(resolveInterfaceName('10.0.0.1', interfaces), null)
  })
})

describe('parseLsofListeners()', () => {
  it('parses field output into listeners', () => {
    const output = [
      'p100',
      'cnode',
      'Luser',
      'f20',
      'tIPv6',
      'PTCP',
      'n*:3000',
      'f21',
      'tIPv4',
      'PTCP',
      'n127.0.0.1:9229',
      'p200',
      'credis-server',
      'Luser',
      'f6',
      'tIPv6',
      'PTCP',
      'n[::1]:6379',
      'f7',
      'tIPv6',
      'PTCP',
      'n127.0.0.1:6380',
      '',
    ].join('\n')

    deepStrictEqual(parseLsofListeners(output), [
      {
        address: '*',
        port: 3000,
        family: 'IPv6',
        pid: 100,
        name: 'node',
        user: 'user',
      },
      {
        address: '127.0.0.1',
        port: 9229,
        family: 'IPv4',
        pid: 100,
        name: 'node',
        user: 'user',
      },
      {
        address: '::1',
        port: 6379,
        family: 'IPv6',
        pid: 200,
        name: 'redis-server',
        user: 'user',
      },
      // IPv6 socket type but an explicit IPv4 address
      {
        address: '127.0.0.1',
        port: 6380,
        family: 'IPv4',
        pid: 200,
        name: 'redis-server',
        user: 'user',
      },
    ])
  })
})

describe('parseSsListeners()', () => {
  it('parses ss output including sockets with hidden owners', () => {
    const output = [
      'LISTEN 0 4096 127.0.0.1:5432 0.0.0.0:* users:(("postgres",pid=10,fd=5))',
      'LISTEN 0 511 *:80 *:* users:(("nginx",pid=20,fd=6),("nginx",pid=21,fd=6))',
      'LISTEN 0 128 [::]:22 [::]:*',
    ].join('\n')

    deepStrictEqual(parseSsListeners(output), [
      {
        address: '127.0.0.1',
        port: 5432,
        family: 'IPv4',
        pid: 10,
        name: 'postgres',
        user: null,
      },
      {
        address: '*',
        port: 80,
        family: 'IPv4',
        pid: 20,
        name: 'nginx',
        user: null,
      },
      {
        address: '*',
        port: 80,
        family: 'IPv4',
        pid: 21,
        name: 'nginx',
        user: null,
      },
      {
        address: '::',
        port: 22,
        family: 'IPv6',
        pid: null,
        name: null,
        user: null,
      },
    ])
  })
})

describe('parseProcessTable()', () => {
  it('parses ps output, keeping full command lines', () => {
    const table = parseProcessTable(
      [
        '    1     0 root   /sbin/launchd',
        '  100     1 user   node server.js --port 3000',
      ].join('\n'),
    )
    deepStrictEqual(table.get(100), {
      pid: 100,
      ppid: 1,
      user: 'user',
      command: 'node server.js --port 3000',
    })
    strictEqual(table.size, 2)
  })
})

describe('processAncestry()', () => {
  it('walks up to the root and guards against cycles', () => {
    const table = parseProcessTable(
      [
        '1 0 root init',
        '10 1 user zsh',
        '20 10 user pnpm',
        '30 20 user node',
        '40 41 user a',
        '41 40 user b',
      ].join('\n'),
    )
    deepStrictEqual(processAncestry(30, table), [30, 20, 10, 1])
    deepStrictEqual(processAncestry(40, table), [40, 41])
    deepStrictEqual(processAncestry(999, table), [999])
  })
})
