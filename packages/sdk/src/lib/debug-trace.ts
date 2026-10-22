import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

type TraceState = {
  path: string
  nextTid: number
  tracks: Map<string, number>
}

/**
 * Trace file state for this process. `undefined` until the first event,
 * `null` when the trace file could not be created.
 */
let state: TraceState | null | undefined

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

const writeEvent = (path: string, event: Record<string, unknown>): void => {
  appendFileSync(path, `${JSON.stringify({ pid: process.pid, ...event })},\n`)
}

/**
 * Close the trace file so it is valid JSON. Runs automatically on exit.
 */
export const closeDebugTrace = (): void => {
  if (!state) {
    state = undefined
    return
  }
  try {
    const name = ['denvig', ...process.argv.slice(2)].join(' ')
    appendFileSync(
      state.path,
      `${JSON.stringify({ name: 'process_name', ph: 'M', pid: process.pid, args: { name } })}\n]\n`,
    )
  } catch {
    // Ignore trace write errors
  }
  process.off('exit', closeDebugTrace)
  state = undefined
}

const getState = (): TraceState | null => {
  if (state !== undefined) return state
  const path = getDebugTracePath()
  try {
    mkdirSync(dirname(path), { recursive: true })
    writeFileSync(path, '[\n')
    state = { path, nextTid: 1, tracks: new Map() }
    process.on('exit', closeDebugTrace)
  } catch {
    state = null
  }
  return state
}

/**
 * Create a new row (thread) in the trace, emitting its metadata so Perfetto
 * labels the row and orders rows by when they started.
 */
const createTrack = (trace: TraceState, name: string, ts: number): number => {
  const tid = trace.nextTid++
  writeEvent(trace.path, { name: 'thread_name', ph: 'M', tid, args: { name } })
  writeEvent(trace.path, {
    name: 'thread_sort_index',
    ph: 'M',
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
  name: string,
  ts: number,
): number => {
  const existing = trace.tracks.get(name)
  if (existing !== undefined) return existing
  const tid = createTrack(trace, name, ts)
  trace.tracks.set(name, tid)
  return tid
}

/**
 * Convert a `performance.now()` value to microseconds since process start,
 * so the timeline begins at zero.
 */
const toMicros = (ms: number): number => Math.round(ms * 1000)

/**
 * Append an event to the trace file when the scope is enabled. Events with a
 * `start` are slices on their own row, others are instant events on a shared
 * `track` row. Times are `performance.now()` values.
 * Errors are ignored so tracing never breaks CLI functionality.
 */
export const appendTraceEvent = (
  scope: string,
  event: {
    name: string
    category: string
    start?: number
    end?: number
    track?: string
    args?: Record<string, unknown>
  },
): void => {
  if (!isDebugEnabled(scope)) return
  const trace = getState()
  if (!trace) return

  try {
    if (event.start !== undefined) {
      const end = event.end ?? performance.now()
      const ts = toMicros(event.start)
      writeEvent(trace.path, {
        name: event.name,
        cat: event.category,
        ph: 'X',
        ts,
        dur: Math.round((end - event.start) * 1000),
        tid: createTrack(trace, event.name, ts),
        args: event.args,
      })
      return
    }

    const ts = toMicros(performance.now())
    writeEvent(trace.path, {
      name: event.name,
      cat: event.category,
      ph: 'i',
      s: 't',
      ts,
      tid: getSharedTrack(trace, event.track ?? event.category, ts),
      args: event.args,
    })
  } catch {
    // Ignore trace write errors
  }
}
