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
 * Options for the table formatter.
 */
export type TableOptions<T> = {
  /** Column definitions */
  columns: ColumnDefinition<T>[]
  /** Data rows to display */
  data: T[]
}

/**
 * Format data as a table with aligned columns.
 * Returns an array of strings (header, separator, rows).
 */
export const formatTable = <T>(options: TableOptions<T>): string[] => {
  const { columns, data } = options

  // Filter to visible columns only
  const visibleColumns = columns.filter((col) => col.visible !== false)

  if (data.length === 0 || visibleColumns.length === 0) {
    return []
  }

  // Calculate column widths (strip ANSI codes for accurate width)
  const columnWidths = visibleColumns.map((col) => {
    const headerLen = col.header.length
    const maxDataLen = Math.max(
      ...data.map((row) => stripAnsi(col.accessor(row)).length),
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
    const rowParts = visibleColumns.map((col, colIndex) => {
      const rawValue = col.accessor(row)
      const width = columnWidths[colIndex]
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
