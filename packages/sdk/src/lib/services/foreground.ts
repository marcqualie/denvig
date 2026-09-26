import type { ForegroundRun, ServiceStateEntry } from './state.ts'

/**
 * Whether a process with the given PID is still alive. `EPERM` means the
 * process exists but belongs to another user, which still counts as alive.
 */
export const isProcessAlive = (pid: number): boolean => {
  try {
    process.kill(pid, 0)
    return true
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM'
  }
}

/**
 * The foreground run recorded for a service, or null when there is none or
 * the owning process has exited (e.g. it was killed before cleaning up).
 */
export const activeForegroundRun = (
  entry: ServiceStateEntry | null | undefined,
): ForegroundRun | null => {
  const foreground = entry?.foreground
  if (!foreground) return null
  return isProcessAlive(foreground.pid) ? foreground : null
}
