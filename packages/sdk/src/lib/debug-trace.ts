import { subscribe } from 'node:diagnostics_channel'
import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

/**
 * Sections of the trace, each shown as a separate collapsible group in Perfetto.
 */
export type TraceGroup = 'denvig' | 'fetch' | 'commands'

const GROUPS: Record<TraceGroup, { pid: number; name: () => string }> = {
  denvig: {
    pid: 1,
    name: () => ['denvig', ...process.argv.slice(2)].join(' '),
  },
  fetch: { pid: 2, name: () => 'fetch requests' },
  commands: { pid: 3, name: () => 'commands' },
}

type TraceState = {
  path: string
  events: number
  nextTid: number
  tracks: Map<string, number>
  groups: Set<TraceGroup>
}

/**
 * Trace file state for this process. `undefined` until the first event,
 * `null` when the trace file could not be created.
 */
let state: TraceState | null | undefined

/**
 * Check if debug tracing is enabled at all (DENVIG_DEBUG is set to any scope).
 */
export const isTracingEnabled = (): boolean =>
  (process.env.DENVIG_DEBUG ?? '').trim() !== ''

/**
 * Check if debug tracing is enabled for a scope.
 * DENVIG_DEBUG accepts a comma separated list of scopes (eg. `deps`) or `*` for all.
 */
export const isDebugEnabled = (scope: string): boolean => {
  const scopes = (process.env.DENVIG_DEBUG ?? '')
    .split(',')
    .map((s) => s.trim())
  return scopes.includes(scope) || scopes.includes('*')
}

/**
 * Get the path to write the Chrome Trace Event Format file for this run.
 * Defaults to ~/.denvig/logs/debug/traces/{YYYY-MM-DD}/{HHMMSS}-{pid}.trace.json
 * and can be overridden via DENVIG_DEBUG_TRACE_PATH environment variable.
 */
export const getDebugTracePath = (): string => {
  if (process.env.DENVIG_DEBUG_TRACE_PATH) {
    return resolve(process.env.DENVIG_DEBUG_TRACE_PATH)
  }
  const iso = new Date().toISOString()
  const time = iso.slice(11, 19).replace(/:/g, '')
  return resolve(
    homedir(),
    '.denvig',
    'logs',
    'debug',
    'traces',
    iso.slice(0, 10),
    `${time}-${process.pid}.trace.json`,
  )
}

/**
 * Path of the trace file written by this process, or `null` if no events
 * have been traced.
 */
export const getActiveDebugTracePath = (): string | null => state?.path ?? null

/**
 * Write an event to the trace. Events are separated by leading commas so the
 * file stays loadable even if the process dies before the array is closed.
 */
const writeEvent = (trace: TraceState, event: Record<string, unknown>) => {
  const separator = trace.events === 0 ? '' : ',\n'
  appendFileSync(trace.path, `${separator}${JSON.stringify(event)}`)
  trace.events++
}

const getState = (): TraceState | null => {
  if (state !== undefined) return state
  const path = getDebugTracePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '[\n')
    state = {
      path,
      events: 0,
      // Row ids start above the group pids so Perfetto doesn't label a row as a main thread
      nextTid: 10,
      tracks: new Map(),
      groups: new Set(),
    }
    process.on('exit', closeDebugTrace)
  } catch {
    state = null
  }
  return state
}

/**
 * Get the pid for a group, emitting its name and order on first use.
 */
const getGroupPid = (trace: TraceState, group: TraceGroup): number => {
  const { pid, name } = GROUPS[group]
  if (!trace.groups.has(group)) {
    trace.groups.add(group)
    writeEvent(trace, {
      name: 'process_name',
      ph: 'M',
      pid,
      args: { name: name() },
    })
    writeEvent(trace, {
      name: 'process_sort_index',
      ph: 'M',
      pid,
      args: { sort_index: pid },
    })
  }
  return pid
}

/**
 * Create a new row (thread) in a group, emitting its metadata so Perfetto
 * labels the row and orders rows by when they started.
 */
const createTrack = (
  trace: TraceState,
  pid: number,
  name: string,
  ts: number,
): number => {
  const tid = trace.nextTid++
  writeEvent(trace, { name: 'thread_name', ph: 'M', pid, tid, args: { name } })
  writeEvent(trace, {
    name: 'thread_sort_index',
    ph: 'M',
    pid,
    tid,
    args: { sort_index: ts },
  })
  return tid
}

/**
 * Get the row for a named track shared by multiple events.
 */
const getSharedTrack = (
  trace: TraceState,
  pid: number,
  name: string,
  ts: number,
): number => {
  const key = `${pid}:${name}`
  const existing = trace.tracks.get(key)
  if (existing !== undefined) return existing
  const tid = createTrack(trace, pid, name, ts)
  trace.tracks.set(key, tid)
  return tid
}

/**
 * Convert a `performance.now()` value to microseconds since process start,
 * so the timeline begins at zero.
 */
const toMicros = (ms: number): number => Math.round(ms * 1000)

/**
 * Append an event to the trace file. Events with a `scope` are only traced
 * when that scope is enabled, others whenever tracing is enabled. Events
 * with a `start` are slices on their own row, others are instant events on
 * a shared `track` row. Times are `performance.now()` values.
 * Errors are ignored so tracing never breaks CLI functionality.
 */
export const appendTraceEvent = (event: {
  group: TraceGroup
  scope?: string
  name: string
  category: string
  start?: number
  end?: number
  track?: string
  args?: Record<string, unknown>
}): void => {
  if (event.scope ? !isDebugEnabled(event.scope) : !isTracingEnabled()) return
  const trace = getState()
  if (!trace) return

  try {
    const pid = getGroupPid(trace, event.group)

    if (event.start !== undefined) {
      const end = event.end ?? performance.now()
      const ts = toMicros(event.start)
      const tid = createTrack(trace, pid, event.name, ts)
      writeEvent(trace, {
        name: event.name,
        cat: event.category,
        ph: 'X',
        ts,
        dur: Math.round((end - event.start) * 1000),
        pid,
        tid,
        args: event.args,
      })
      return
    }

    const ts = toMicros(performance.now())
    const track = event.track ?? event.category
    writeEvent(trace, {
      name: event.name,
      cat: event.category,
      ph: 'i',
      s: 't',
      ts,
      pid,
      tid: getSharedTrack(trace, pid, track, ts),
      args: event.args,
    })
  } catch {
    // Ignore trace write errors
  }
}

/**
 * Trace a child process in the `commands` group, named by its command line.
 */
export const traceCommand = async <T>(
  command: string,
  args: string[],
  cwd: string | undefined,
  run: () => Promise<T>,
  getExitCode: (result: T) => number | null = () => 0,
): Promise<T> => {
  const start = performance.now()
  const trace = (details: Record<string, unknown>) =>
    appendTraceEvent({
      group: 'commands',
      name: [command, ...args].join(' '),
      category: command,
      start,
      args: { cwd: cwd ?? process.cwd(), ...details },
    })
  try {
    const result = await run()
    trace({ exitCode: getExitCode(result) })
    return result
  } catch (e) {
    const error = e as { code?: unknown; signal?: string; message?: string }
    trace({
      exitCode: typeof error.code === 'number' ? error.code : undefined,
      signal: error.signal,
      error: error.message?.trim() ?? String(e),
    })
    throw e
  }
}

type PendingRequest = {
  start: number
  method: string
  url: string
  status?: number
  headersAt?: number
}

const pendingRequests = new Map<object, PendingRequest>()
let fetchTracingEnabled = false

const decodeUrl = (url: string): string => {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

const finishRequest = (
  request: object,
  details: Record<string, unknown> = {},
  end?: number,
) => {
  const pending = pendingRequests.get(request)
  if (!pending) return
  pendingRequests.delete(request)
  const host = decodeUrl(pending.url.replace(/^https?:\/\//, ''))
  appendTraceEvent({
    group: 'fetch',
    name: `fetch ${pending.method} ${host}`,
    category: 'fetch',
    start: pending.start,
    end,
    args: {
      method: pending.method,
      url: pending.url,
      status: pending.status,
      timeToHeadersMs:
        pending.headersAt === undefined
          ? undefined
          : Math.round(pending.headersAt - pending.start),
      ...details,
    },
  })
}

/**
 * Trace every `fetch` request made by this process in the `fetch` group,
 * using Node's built-in undici diagnostics channels. Does nothing unless
 * DENVIG_DEBUG is set.
 */
export const enableFetchTracing = (): void => {
  if (fetchTracingEnabled || !isTracingEnabled()) return
  fetchTracingEnabled = true

  type Message = {
    request: { method: string; origin: string; path: string }
    response?: { statusCode: number }
    error?: Error
  }
  subscribe('undici:request:create', (message) => {
    const { request } = message as Message
    pendingRequests.set(request, {
      start: performance.now(),
      method: request.method,
      url: `${request.origin}${request.path}`,
    })
  })
  subscribe('undici:request:headers', (message) => {
    const { request, response } = message as Message
    const pending = pendingRequests.get(request)
    if (!pending) return
    pending.status = response?.statusCode
    pending.headersAt = performance.now()
  })
  subscribe('undici:request:trailers', (message) => {
    finishRequest((message as Message).request)
  })
  subscribe('undici:request:error', (message) => {
    const { request, error } = message as Message
    finishRequest(request, { error: error?.message })
  })
}

/**
 * Close the trace file so it is valid JSON. Requests still in flight are
 * recorded up to when their headers arrived. Runs automatically on exit.
 */
export const closeDebugTrace = (): void => {
  for (const [request, pending] of pendingRequests) {
    finishRequest(request, { incomplete: true }, pending.headersAt)
  }
  if (!state) {
    state = undefined
    return
  }
  try {
    appendFileSync(state.path, '\n]\n')
  } catch {
    // Ignore trace write errors
  }
  process.off('exit', closeDebugTrace)
  state = undefined
}
