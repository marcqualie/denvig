import { existsSync, statSync } from 'node:fs'
import { basename, dirname, join } from 'node:path'
import { getGlobalConfigPath, pluginWatchFiles } from '@denvig/sdk/internal'

import { createWarmQueue, markDependenciesStale } from './dependencies.ts'
import { refreshProject, syncProjects } from './scan.ts'
import { createStore } from './store.ts'
import {
  createDebouncer,
  createWatchRegistry,
  type WatchHandler,
} from './watch.ts'

export type DaemonOptions = {
  /**
   * Quiet period before acting on filesystem events. Git and package managers
   * touch many files at once, so bursts collapse into one refresh.
   */
  debounceMs?: number
  /**
   * Interval for a full re-read of every project, as a safety net for events
   * the watchers miss (eg. a branch switch inside a detached worktree).
   */
  rescanIntervalMs?: number
  log?: (message: string) => void
}

const isDirectory = (path: string): boolean => {
  try {
    return statSync(path).isDirectory()
  } catch {
    return false
  }
}

/**
 * The daemon's state and the watchers that keep it current.
 */
export const createDaemon = (options: DaemonOptions = {}) => {
  const {
    debounceMs = 250,
    rescanIntervalMs = 10 * 60 * 1000,
    log = console.log,
  } = options

  const store = createStore()
  const watches = createWatchRegistry()
  const debounce = createDebouncer(debounceMs)
  const warm = createWarmQueue(store)
  const startedAt = Date.now()

  const watchFiles = pluginWatchFiles()
  const rootWatchNames = new Set(watchFiles.filter((f) => !f.includes('/')))
  const nestedWatchDirs = watchFiles.filter((f) => f.includes('/'))

  // Store mutations run one at a time so refreshes never interleave.
  let queue: Promise<void> = Promise.resolve()
  const serial = (label: string, fn: () => Promise<void>) => {
    queue = queue.then(fn).catch((error: unknown) => {
      log(`${label} failed: ${String(error)}`)
    })
    return queue
  }

  const warmStale = (paths: Iterable<string>) => {
    warm.enqueue(
      [...paths].filter(
        (path) => store.dependencies.get(path)?.status === 'stale',
      ),
    )
  }

  const afterChange = (primaryPaths: string[]) => {
    watches.sync(desiredWatches())
    warmStale(
      primaryPaths.flatMap(
        (path) =>
          store.projects.get(path)?.worktrees.map((wt) => wt.path) ?? [],
      ),
    )
  }

  const scheduleRefresh = (primaryPath: string) => {
    debounce.run(`project:${primaryPath}`, () => {
      serial(`refresh ${primaryPath}`, async () => {
        await refreshProject(store, primaryPath)
        log(`refreshed ${primaryPath}`)
        afterChange([primaryPath])
      })
    })
  }

  const scheduleSync = (rebuild: boolean) => {
    debounce.run(rebuild ? 'rebuild' : 'sync', () => {
      serial(rebuild ? 'rebuild' : 'sync', async () => {
        const changed = await syncProjects(store, { rebuild })
        log(`synced ${store.projects.size} projects (${changed.length} read)`)
        afterChange(changed)
      })
    })
  }

  const onDependencyFilesChanged = (worktreePath: string) => {
    // Mark stale straight away so nothing serves outdated data during the
    // debounce window, but only reload once the burst has settled.
    markDependenciesStale(store, worktreePath)
    debounce.run(`deps:${worktreePath}`, () => warmStale([worktreePath]))
  }

  const onCheckoutEvent = (
    primaryPath: string,
    worktreePath: string,
    filename: string | null,
  ) => {
    const isDependencyFile = filename === null || rootWatchNames.has(filename)
    // Root files also feed actions and package managers, so re-read the
    // project for dependency files as well as `.denvig.yml`.
    if (isDependencyFile || filename === '.denvig.yml') {
      scheduleRefresh(primaryPath)
    }
    if (isDependencyFile) onDependencyFilesChanged(worktreePath)
  }

  /**
   * A project parent directory changed. Only re-list projects when a directory
   * appeared or a known project vanished; parents like `~` see constant churn
   * from ordinary files.
   */
  const onParentEvent = (dir: string, filename: string | null) => {
    if (filename === null) return scheduleSync(false)
    const path = join(dir, filename)
    const changed = store.byPath.has(path)
      ? !existsSync(path)
      : isDirectory(path)
    if (changed) scheduleSync(false)
  }

  const desiredWatches = (): Map<string, WatchHandler> => {
    const handlers = new Map<string, WatchHandler[]>()
    const add = (dir: string, handler: WatchHandler) => {
      const existing = handlers.get(dir)
      if (existing) existing.push(handler)
      else handlers.set(dir, [handler])
    }

    for (const project of store.projects.values()) {
      for (const worktree of project.worktrees) {
        add(worktree.path, (filename) =>
          onCheckoutEvent(project.path, worktree.path, filename),
        )
        for (const nested of nestedWatchDirs) {
          add(join(worktree.path, nested), () =>
            onDependencyFilesChanged(worktree.path),
          )
        }
      }
      if (project.gitDir) {
        // `.git/worktrees` only exists once the first worktree is added, so
        // watch `.git` for it to appear.
        add(project.gitDir, (filename) => {
          if (filename === null || filename === 'worktrees') {
            scheduleRefresh(project.path)
          }
        })
        add(join(project.gitDir, 'worktrees'), () =>
          scheduleRefresh(project.path),
        )
      }
      const parent = dirname(project.path)
      add(parent, (filename) => onParentEvent(parent, filename))
    }

    const configPath = getGlobalConfigPath()
    add(dirname(configPath), (filename) => {
      if (filename === null || filename === basename(configPath)) {
        scheduleSync(true)
      }
    })

    const combined = new Map<string, WatchHandler>()
    for (const [dir, list] of handlers) {
      combined.set(dir, (filename) => {
        for (const handler of list) handler(filename)
      })
    }
    return combined
  }

  let interval: NodeJS.Timeout | undefined

  return {
    store,

    /**
     * Scan every project, start watching, and begin warming dependencies.
     */
    start: async () => {
      const started = performance.now()
      await syncProjects(store)
      watches.sync(desiredWatches())
      const worktrees = [...store.projects.values()].flatMap((p) =>
        p.worktrees.map((wt) => wt.path),
      )
      log(
        `scanned ${store.projects.size} projects (${worktrees.length} checkouts) in ${Math.round(performance.now() - started)}ms, watching ${watches.size()} directories`,
      )
      warmStale(worktrees)
      interval = setInterval(() => scheduleSync(true), rescanIntervalMs)
      interval.unref()
    },

    stats: () => ({
      uptime: Math.round((Date.now() - startedAt) / 1000),
      projects: store.projects.size,
      checkouts: store.byPath.size,
      watches: watches.size(),
      scannedAt: store.scannedAt,
    }),

    stop: () => {
      clearInterval(interval)
      debounce.clear()
      watches.close()
    },
  }
}

export type Daemon = ReturnType<typeof createDaemon>
