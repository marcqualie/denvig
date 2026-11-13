import { chmodSync, existsSync, mkdirSync, unlinkSync } from 'node:fs'
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from 'node:http'
import { connect } from 'node:net'
import { dirname } from 'node:path'

import packageJson from '../package.json' with { type: 'json' }
import {
  getDependenciesRoute,
  getProjectRoute,
  listProjectsRoute,
  type RouteResult,
} from './routes/projects.ts'

import type { Daemon } from './daemon.ts'

const sendJson = (res: ServerResponse, { status, body }: RouteResult) => {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

/**
 * Split a path into decoded segments. Refs and paths contain `/`, so clients
 * URL-encode them into a single segment.
 */
const pathSegments = (url: string): string[] | null => {
  try {
    const { pathname } = new URL(url, 'http://denvigd')
    return pathname.split('/').filter(Boolean).map(decodeURIComponent)
  } catch {
    return null
  }
}

export const route = async (
  daemon: Daemon,
  method: string,
  url: string,
): Promise<RouteResult> => {
  if (method !== 'GET') {
    return { status: 405, body: { error: 'Method not allowed' } }
  }
  const segments = pathSegments(url)
  if (segments?.[0] !== 'api') {
    return { status: 404, body: { error: 'Not found' } }
  }
  const [, resource, id, sub] = segments

  if (resource === 'health' && segments.length === 2) {
    return {
      status: 200,
      body: {
        version: packageJson.version,
        pid: process.pid,
        ...daemon.stats(),
      },
    }
  }
  if (resource === 'projects') {
    if (segments.length === 2) return listProjectsRoute(daemon.store)
    if (segments.length === 3) return getProjectRoute(daemon.store, id)
    if (segments.length === 4 && sub === 'dependencies') {
      return getDependenciesRoute(daemon.store, id)
    }
  }
  return { status: 404, body: { error: 'Not found' } }
}

const handler =
  (daemon: Daemon) => (req: IncomingMessage, res: ServerResponse) => {
    route(daemon, req.method ?? 'GET', req.url ?? '/').then(
      (result) => sendJson(res, result),
      (error: unknown) =>
        sendJson(res, { status: 500, body: { error: String(error) } }),
    )
  }

const listen = (server: Server, socketPath: string) =>
  new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(socketPath, () => {
      server.off('error', reject)
      resolve()
    })
  })

/**
 * Whether something is accepting connections on a unix socket.
 */
const isSocketLive = (path: string) =>
  new Promise<boolean>((resolve) => {
    const socket = connect(path)
    socket.once('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.once('error', () => resolve(false))
  })

/**
 * Serve the API on a unix socket, readable only by the current user. A stale
 * socket left by a crashed daemon is replaced; a live one is an error.
 */
export const serveSocket = async (
  daemon: Daemon,
  socketPath: string,
): Promise<() => Promise<void>> => {
  mkdirSync(dirname(socketPath), { recursive: true })
  if (existsSync(socketPath)) {
    if (await isSocketLive(socketPath)) {
      throw new Error(`denvigd is already running on ${socketPath}`)
    }
    unlinkSync(socketPath)
  }
  const server = createServer(handler(daemon))
  await listen(server, socketPath)
  chmodSync(socketPath, 0o600)
  return () =>
    new Promise((resolve) => {
      server.close(() => resolve())
      server.closeAllConnections()
    })
}
