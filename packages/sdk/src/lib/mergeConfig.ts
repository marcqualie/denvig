import { isDeepStrictEqual } from 'node:util'

/**
 * Keys that must never be copied during a merge, to prevent prototype
 * pollution from untrusted YAML input.
 */
const UNSAFE_KEYS = new Set(['__proto__', 'constructor', 'prototype'])

/**
 * Plain object check that excludes arrays, null and class instances.
 */
export const isPlainObject = (
  value: unknown,
): value is Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false
  }
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

/**
 * Deep merge an override config on top of a base config.
 *
 * - Objects are merged recursively, so matching keys combine their values.
 * - Arrays are combined, appending override entries that are not already present.
 * - `null` in the override removes the key from the result.
 * - Any other value (or a value of a different type) replaces the base value.
 *
 * Inputs are never mutated.
 */
export const mergeConfig = (base: unknown, override: unknown): unknown => {
  if (override === undefined) return clone(base)

  if (Array.isArray(base) && Array.isArray(override)) {
    const result = clone(base) as unknown[]
    for (const entry of override) {
      if (entry === null || entry === undefined) continue
      if (!result.some((existing) => isDeepStrictEqual(existing, entry))) {
        result.push(clone(entry))
      }
    }
    return result
  }

  if (isPlainObject(base) && isPlainObject(override)) {
    const result: Record<string, unknown> = {}
    for (const [key, value] of Object.entries(base)) {
      if (UNSAFE_KEYS.has(key)) continue
      result[key] = clone(value)
    }
    for (const [key, value] of Object.entries(override)) {
      if (UNSAFE_KEYS.has(key)) continue
      if (value === null) {
        delete result[key]
        continue
      }
      result[key] = mergeConfig(result[key], value)
    }
    return result
  }

  // Type mismatch or a brand new key: normalise the override on its own so
  // nested `null` entries are still stripped.
  if (Array.isArray(override)) return mergeConfig([], override)
  if (isPlainObject(override)) return mergeConfig({}, override)
  return clone(override)
}

/**
 * Deep clone plain YAML data, dropping unsafe keys.
 */
const clone = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(clone)
  if (isPlainObject(value)) {
    const result: Record<string, unknown> = {}
    for (const [key, entry] of Object.entries(value)) {
      if (UNSAFE_KEYS.has(key)) continue
      result[key] = clone(entry)
    }
    return result
  }
  return value
}
