import { readFile } from 'node:fs/promises'
import { parse } from 'yaml'

import { parseDuration } from './formatters/duration.ts'

type PnpmCatalog = Record<string, string>

type PnpmWorkspaceConfig = {
  minimumReleaseAge?: number | string
  minimumReleaseAgeExclude?: string[]
  catalog?: PnpmCatalog
  catalogs?: Record<string, PnpmCatalog>
}

export type PnpmReleaseAgeConfig = {
  minimumReleaseAgeMs: number | null
  exclude: string[]
}

export type PnpmCatalogs = {
  default: PnpmCatalog
  named: Record<string, PnpmCatalog>
}

const readPnpmWorkspaceConfig = async (
  projectPath: string,
): Promise<PnpmWorkspaceConfig | null> => {
  try {
    const content = await readFile(
      `${projectPath}/pnpm-workspace.yaml`,
      'utf-8',
    )
    return parse(content) as PnpmWorkspaceConfig
  } catch {
    return null
  }
}

/**
 * Read pnpm catalog definitions from `pnpm-workspace.yaml`.
 * Returns the default catalog (under the top-level `catalog` key) and any
 * named catalogs (under `catalogs.<name>`). Returns null if the file is
 * missing or doesn't define any catalogs.
 */
export const readPnpmCatalogs = async (
  projectPath: string,
): Promise<PnpmCatalogs | null> => {
  const config = await readPnpmWorkspaceConfig(projectPath)
  if (!config) return null
  const defaultCatalog =
    config.catalog && typeof config.catalog === 'object' ? config.catalog : null
  const namedCatalogs =
    config.catalogs && typeof config.catalogs === 'object'
      ? config.catalogs
      : null
  if (!defaultCatalog && !namedCatalogs) return null
  return {
    default: defaultCatalog ?? {},
    named: namedCatalogs ?? {},
  }
}

/**
 * Resolve a `catalog:` / `catalog:<name>` specifier to the actual specifier
 * declared in `pnpm-workspace.yaml`. Returns null if the specifier doesn't
 * reference a catalog or the catalog/entry isn't found.
 */
export const resolveCatalogSpecifier = (
  catalogs: PnpmCatalogs | null,
  packageName: string,
  specifier: string,
): { specifier: string; catalogName: string } | null => {
  if (!catalogs) return null
  if (!specifier.startsWith('catalog:')) return null
  const name = specifier.slice('catalog:'.length).trim()
  const catalogName = name === '' || name === 'default' ? 'default' : name
  const catalog =
    catalogName === 'default' ? catalogs.default : catalogs.named[catalogName]
  if (!catalog) return null
  const resolved = catalog[packageName]
  if (!resolved) return null
  return { specifier: resolved, catalogName }
}

/**
 * Build a source identifier for a catalog entry.
 *
 * @example catalogSource('default') // 'pnpm-workspace.yaml$catalog'
 * @example catalogSource('react17') // 'pnpm-workspace.yaml$catalogs.react17'
 */
export const catalogSource = (catalogName: string): string => {
  return catalogName === 'default'
    ? 'pnpm-workspace.yaml$catalog'
    : `pnpm-workspace.yaml$catalogs.${catalogName}`
}

/**
 * Read release age configuration from pnpm-workspace.yaml.
 * Returns the minimumReleaseAge as milliseconds (null when not set, so the
 * caller can apply pnpm's default) and the exclude list.
 * Returns null only if the file doesn't exist or can't be parsed.
 * pnpm stores the age value as minutes (e.g., 1440 = 24 hours).
 */
export const readPnpmReleaseAgeConfig = async (
  projectPath: string,
): Promise<PnpmReleaseAgeConfig | null> => {
  const config = await readPnpmWorkspaceConfig(projectPath)
  if (!config) return null

  const minimumReleaseAgeMs =
    config.minimumReleaseAge == null
      ? null
      : parseDuration(String(config.minimumReleaseAge))
  const exclude = Array.isArray(config.minimumReleaseAgeExclude)
    ? config.minimumReleaseAgeExclude.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []

  return { minimumReleaseAgeMs, exclude }
}

const globToRegExp = (pattern: string): RegExp => {
  const escaped = pattern
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&'))
    .join('.*')
  return new RegExp(`^${escaped}$`)
}

/**
 * Check whether a package version is exempt from pnpm's minimumReleaseAge.
 * Supports the same entry formats as pnpm's `minimumReleaseAgeExclude`:
 * exact names (`react`), globs (`@myorg/*`) and version-pinned entries
 * (`nx@21.6.5` or `nx@21.6.5 || 21.6.6`).
 */
export const isReleaseAgeExcluded = (
  exclude: string[],
  name: string,
  version: string,
): boolean => {
  return exclude.some((entry) => {
    const versionSeparator = entry.indexOf('@', 1)
    if (versionSeparator === -1) {
      return entry.includes('*')
        ? globToRegExp(entry).test(name)
        : entry === name
    }
    if (entry.slice(0, versionSeparator) !== name) return false
    return entry
      .slice(versionSeparator + 1)
      .split('||')
      .some((v) => v.trim() === version)
  })
}
