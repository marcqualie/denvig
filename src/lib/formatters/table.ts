// ANSI color codes
export const COLORS = {
  reset: '\x1b[0m',
  white: '\x1b[37m',
  grey: '\x1b[90m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  bold: '\x1b[1m',
}

/**
 * Strip ANSI escape codes from a string to get display width.
 */
const stripAnsi = (str: string): string => {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Required for ANSI code stripping
  return str.replace(/\x1b\[[0-9;]*m/g, '')
}

/**
 * Tree metadata for a row.
 */
export type TreeMeta = {
  depth: number
  isLast: boolean
  hasChildren: boolean
  parentPath: boolean[] // Track which ancestors are "last" for proper prefix rendering
}

/**
 * Generate the tree prefix for a row based on its tree metadata.
 */
const getTreePrefix = (meta: TreeMeta): string => {
  if (meta.depth === 0) return ''

  let prefix = ''

  // Build prefix based on parent path
  for (let i = 0; i < meta.parentPath.length - 1; i++) {
    prefix += meta.parentPath[i] ? '    ' : '│ '
  }

  // Add the branch character
  if (meta.hasChildren) {
    prefix += meta.isLast ? '└─┬ ' : '├─┬ '
  } else {
    prefix += meta.isLast ? '└── ' : '├── '
  }

  return prefix
}

/**
 * Column definition for the table formatter.
 */
export type ColumnDefinition<T> = {
  /** Header text to display */
  header: string
  /** Function to extract the value from a row (can include ANSI colors) */
  accessor: (row: T) => string
  /** Optional function to format/colorize the value */
  format?: (value: string, row: T) => string
  /** Whether this column is visible (default: true) */
  visible?: boolean
}

/**
 * Tree options for rendering hierarchical data.
 */
export type TreeOptions<T> = {
  /** Get the depth of a row (0 = root level) */
  getDepth: (row: T) => number
  /** Get whether this row is the last sibling at its level */
  getIsLast: (row: T) => boolean
  /** Get whether this row has children */
  getHasChildren: (row: T) => boolean
  /** Get the parent path (array of isLast values for ancestors) */
  getParentPath: (row: T) => boolean[]
}

/**
 * Options for the table formatter.
 */
export type TableOptions<T> = {
  /** Column definitions */
  columns: ColumnDefinition<T>[]
  /** Data rows to display */
  data: T[]
  /** Optional tree rendering options - enables tree prefixes on first column */
  tree?: TreeOptions<T>
}

/**
 * Format data as a table with aligned columns.
 * Returns an array of strings (header, separator, rows).
 */
export const formatTable = <T>(options: TableOptions<T>): string[] => {
  const { columns, data, tree } = options

  // Filter to visible columns only
  const visibleColumns = columns.filter((col) => col.visible !== false)

  if (data.length === 0 || visibleColumns.length === 0) {
    return []
  }

  // Calculate column widths (strip ANSI codes for accurate width)
  const columnWidths = visibleColumns.map((col, colIndex) => {
    const headerLen = col.header.length
    const maxDataLen = Math.max(
      ...data.map((row) => {
        let value = col.accessor(row)

        // For first column with tree enabled, include prefix in width calculation
        if (tree && colIndex === 0) {
          const meta: TreeMeta = {
            depth: tree.getDepth(row),
            isLast: tree.getIsLast(row),
            hasChildren: tree.getHasChildren(row),
            parentPath: tree.getParentPath(row),
          }
          const prefix = getTreePrefix(meta)
          value = prefix + stripAnsi(value)
        }

        return stripAnsi(value).length
      }),
    )
    return Math.max(headerLen, maxDataLen)
  })

  const lines: string[] = []

  // Build header line
  const headerParts = visibleColumns.map((col, i) =>
    col.header.padEnd(columnWidths[i]),
  )
  lines.push(headerParts.join('  '))

  // Build separator line
  const totalWidth =
    columnWidths.reduce((sum, w) => sum + w, 0) +
    (visibleColumns.length - 1) * 2
  lines.push('-'.repeat(totalWidth))

  // Build data rows
  for (const row of data) {
    const depth = tree ? tree.getDepth(row) : 0
    const isSubRow = depth > 0

    const rowParts = visibleColumns.map((col, colIndex) => {
      let rawValue = col.accessor(row)
      const width = columnWidths[colIndex]

      // For first column with tree enabled, add prefix and apply grey color
      if (tree && colIndex === 0) {
        const meta: TreeMeta = {
          depth: tree.getDepth(row),
          isLast: tree.getIsLast(row),
          hasChildren: tree.getHasChildren(row),
          parentPath: tree.getParentPath(row),
        }
        const prefix = getTreePrefix(meta)
        const name = isSubRow
          ? `${COLORS.grey}${stripAnsi(rawValue)}${COLORS.reset}`
          : rawValue
        rawValue = prefix + name
      } else if (isSubRow && !col.format) {
        // Apply grey color to sub-row values (unless they have custom formatting)
        // Skip colorizing whitespace-only values
        const strippedValue = stripAnsi(rawValue)
        if (strippedValue.trim()) {
          rawValue = `${COLORS.grey}${strippedValue}${COLORS.reset}`
        }
      }

      const displayLen = stripAnsi(rawValue).length
      const padding = width - displayLen

      // If there's a format function, pad raw value first then format
      if (col.format) {
        const strippedValue = stripAnsi(rawValue)
        const paddedRaw = strippedValue.padEnd(width)
        return col.format(paddedRaw, row)
      }

      // Add padding after the value (accounting for ANSI codes)
      return rawValue + ' '.repeat(Math.max(0, padding))
    })

    lines.push(rowParts.join('  '))
  }

  return lines
}
