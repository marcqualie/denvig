import { existsSync, type FSWatcher, watch } from 'node:fs'

/**
 * Called with the changed entry's name, or null when the platform did not say.
 */
export type WatchHandler = (filename: string | null) => void

/**
 * Keeps a set of non-recursive directory watches in line with what the store
 * currently needs. Directories are watched rather than individual files so that
 * atomic saves (write to a temp file, then rename) are still seen.
 */
export const createWatchRegistry = () => {
  const watchers = new Map<string, FSWatcher>()
  const handlers = new Map<string, WatchHandler>()

  const open = (dir: string) => {
    if (!existsSync(dir)) return
    try {
      const watcher = watch(dir, { persistent: true }, (_event, filename) => {
        handlers.get(dir)?.(filename ? String(filename) : null)
      })
      // A watched directory that is deleted errors rather than emitting; drop
      // it so the next sync can re-open it if it comes back.
      watcher.on('error', () => {
        watcher.close()
        if (watchers.get(dir) === watcher) watchers.delete(dir)
        handlers.get(dir)?.(null)
      })
      watchers.set(dir, watcher)
    } catch {
      // Unreadable or vanished between the check and the watch.
    }
  }

  return {
    /**
     * Watch exactly the directories in `desired`, opening and closing watches
     * as needed. Handlers are always replaced with the latest ones.
     */
    sync: (desired: Map<string, WatchHandler>) => {
      for (const [dir, watcher] of watchers) {
        if (!desired.has(dir)) {
          watcher.close()
          watchers.delete(dir)
        }
      }
      handlers.clear()
      for (const [dir, handler] of desired) {
        handlers.set(dir, handler)
        if (!watchers.has(dir)) open(dir)
      }
    },
    size: () => watchers.size,
    close: () => {
      for (const watcher of watchers.values()) watcher.close()
      watchers.clear()
      handlers.clear()
    },
  }
}

/**
 * Collapse bursts of calls per key into one call after `delayMs` of quiet.
 */
export const createDebouncer = (delayMs: number) => {
  const timers = new Map<string, NodeJS.Timeout>()
  return {
    run: (key: string, fn: () => void) => {
      clearTimeout(timers.get(key))
      timers.set(
        key,
        setTimeout(() => {
          timers.delete(key)
          fn()
        }, delayMs),
      )
    },
    clear: () => {
      for (const timer of timers.values()) clearTimeout(timer)
      timers.clear()
    },
  }
}
