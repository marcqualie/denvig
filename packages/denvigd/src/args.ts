import { homedir } from 'node:os'
import { resolve } from 'node:path'
import { parseArgs } from 'node:util'

export type DaemonArgs = {
  socketPath: string
  help: boolean
  version: boolean
}

export const DEFAULT_SOCKET_PATH = resolve(homedir(), '.denvig', 'denvigd.sock')

export const USAGE = `Usage: denvigd [options]

Keeps denvig project state in memory and serves it over a unix socket.

Options:
  --socket <path>       Unix socket path (default: ~/.denvig/denvigd.sock)
  -h, --help            Show this help
  -v, --version         Show the version
`

export const parseDaemonArgs = (argv: string[]): DaemonArgs => {
  const { values } = parseArgs({
    args: argv,
    options: {
      socket: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
    },
    strict: true,
  })
  return {
    socketPath: values.socket ? resolve(values.socket) : DEFAULT_SOCKET_PATH,
    help: values.help ?? false,
    version: values.version ?? false,
  }
}
