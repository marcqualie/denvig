import { appendTraceEvent } from '../debug-trace.ts'

/**
 * Record a dependency lookup that was served from the local cache.
 */
export const logCachedLookup = (lookup: {
  ecosystem: string
  name: string
}): void => {
  appendTraceEvent({
    group: 'denvig',
    scope: 'deps',
    name: `cache hit ${lookup.ecosystem} ${lookup.name}`,
    category: lookup.ecosystem,
    track: `${lookup.ecosystem} cache hits`,
    args: lookup,
  })
}

/**
 * Fetch and parse JSON from a registry. Returns `null` for non-2xx responses.
 */
export const fetchRegistryJson = async <T>(
  url: string,
  init?: RequestInit,
): Promise<T | null> => {
  const response = await fetch(url, init)
  if (!response.ok) return null
  return (await response.json()) as T
}
