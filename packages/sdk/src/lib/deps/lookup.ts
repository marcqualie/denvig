import { appendTraceEvent } from '../debug-trace.ts'

export type DependencyLookup = {
  ecosystem: string
  name: string
}

/**
 * Record a dependency lookup that was served from the local cache.
 */
export const logCachedLookup = (lookup: DependencyLookup): void => {
  appendTraceEvent('deps', {
    name: `${lookup.ecosystem} ${lookup.name}`,
    category: lookup.ecosystem,
    track: `${lookup.ecosystem} cache hits`,
    args: { ...lookup, source: 'cache' },
  })
}

/**
 * Time a network lookup for a dependency and record it to the `deps` debug
 * trace. Errors are recorded and rethrown.
 */
export const timeNetworkLookup = async <T>(
  lookup: DependencyLookup & { url: string },
  run: () => Promise<T>,
  getStatus: (result: T) => number | undefined = () => undefined,
): Promise<T> => {
  const start = performance.now()
  const trace = (args: Record<string, unknown>) =>
    appendTraceEvent('deps', {
      name: `${lookup.ecosystem} ${lookup.name}`,
      category: lookup.ecosystem,
      start,
      args: { ...lookup, source: 'network', ...args },
    })
  try {
    const result = await run()
    trace({ status: getStatus(result) })
    return result
  } catch (e) {
    trace({
      error: e instanceof Error ? e.message.trim() : String(e),
      signal: (e as { signal?: string }).signal,
    })
    throw e
  }
}

/**
 * Fetch and parse JSON from a registry, timing the full request including
 * the body download. Returns `null` for non-2xx responses.
 */
export const fetchRegistryJson = async <T>(
  lookup: DependencyLookup & { url: string },
  init?: RequestInit,
): Promise<T | null> => {
  const { data } = await timeNetworkLookup(
    lookup,
    async () => {
      const response = await fetch(lookup.url, init)
      if (!response.ok) return { status: response.status, data: null }
      return { status: response.status, data: (await response.json()) as T }
    },
    (result) => result.status,
  )
  return data
}
