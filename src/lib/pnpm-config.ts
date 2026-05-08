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
  minimumReleaseAgeMs: number
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
  const hasDefault = config.catalog && typeof config.catalog === 'object'
  const hasNamed = config.catalogs && typeof config.catalogs === 'object'
  if (!hasDefault && !hasNamed) return null
  return {
    default: hasDefault ? config.catalog! : {},
    named: hasNamed ? config.catalogs! : {},
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
 * Returns the minimumReleaseAge as milliseconds and the exclude list.
 * Returns null if the file doesn't exist or the setting isn't configured.
 * pnpm stores the age value as minutes (e.g., 1440 = 24 hours).
 */
export const readPnpmReleaseAgeConfig = async (
  projectPath: string,
): Promise<PnpmReleaseAgeConfig | null> => {
  try {
    const content = await readFile(
      `${projectPath}/pnpm-workspace.yaml`,
      'utf-8',
    )
    const config = parse(content) as PnpmWorkspaceConfig
    if (config?.minimumReleaseAge == null) return null

    const value = String(config.minimumReleaseAge)
    const ms = parseDuration(value)
    if (ms === null) return null

    return {
      minimumReleaseAgeMs: ms,
      exclude: config.minimumReleaseAgeExclude ?? [],
    }
  } catch {
    return null
  }
}
