import { parseAllDocuments } from 'yaml'

/**
 * Sections of a pnpm lockfile that are keyed records and therefore need
 * merging rather than overwriting when a lockfile spans multiple documents.
 */
const RECORD_SECTIONS = ['importers', 'packages', 'snapshots'] as const

type LockfileRecord = Record<string, unknown>

const isRecord = (value: unknown): value is LockfileRecord =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

/**
 * Merge one lockfile document into the accumulated result.
 *
 * `importers`, `packages` and `snapshots` are merged by key, and importer
 * entries themselves are merged so an importer described across two documents
 * (eg. `packageManagerDependencies` in one and `dependencies` in another)
 * ends up as a single entry.
 */
const mergeDocument = (target: LockfileRecord, doc: LockfileRecord): void => {
  for (const [key, value] of Object.entries(doc)) {
    const isRecordSection = (RECORD_SECTIONS as readonly string[]).includes(key)
    const existing = target[key]

    if (!isRecordSection || !isRecord(value) || !isRecord(existing)) {
      target[key] = value
      continue
    }

    for (const [entryKey, entryValue] of Object.entries(value)) {
      const existingEntry = existing[entryKey]
      existing[entryKey] =
        isRecord(existingEntry) && isRecord(entryValue)
          ? { ...existingEntry, ...entryValue }
          : entryValue
    }
  }
}

/**
 * Parse a pnpm-lock.yaml file into a single object.
 *
 * pnpm 12 splits the lockfile into multiple YAML documents — the first holds
 * the package manager's own dependencies, the second the project's — so every
 * document is parsed and merged together.
 */
export const parsePnpmLockfile = <T>(content: string): T => {
  const merged: LockfileRecord = {}

  for (const document of parseAllDocuments(content)) {
    const parsed = document.toJS()
    if (isRecord(parsed)) {
      mergeDocument(merged, parsed)
    }
  }

  return merged as T
}
