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
 * Upper bound for a single registry request, including reading the body.
 * Without it a stalled connection waits on undici's 300s header and body
 * timeouts, and one hung lookup holds up the whole dependency check.
 */
export const REGISTRY_TIMEOUT_MS = 30_000

/**
 * Fetch and parse JSON from a registry. Returns `null` for non-2xx responses
 * and throws if the request does not complete within `timeoutMs`.
 */
export const fetchRegistryJson = async <T>(
  url: string,
  init?: RequestInit,
  timeoutMs: number = REGISTRY_TIMEOUT_MS,
): Promise<T | null> => {
  const timeout = AbortSignal.timeout(timeoutMs)
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeout])
    : timeout
  const response = await fetch(url, { ...init, signal })
  if (!response.ok) return null
  return (await response.json()) as T
}
