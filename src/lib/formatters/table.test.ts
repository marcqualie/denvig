import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { COLORS, formatTable } from './table.ts'

describe('formatTable()', () => {
  it('should return empty array for empty data', () => {
    const result = formatTable({
      columns: [{ header: 'Name', accessor: (r: { name: string }) => r.name }],
      data: [],
    })
    deepStrictEqual(result, [])
  })

  it('should return empty array for no visible columns', () => {
    const result = formatTable({
      columns: [
        {
          header: 'Name',
          accessor: (r: { name: string }) => r.name,
          visible: false,
        },
      ],
      data: [{ name: 'test' }],
    })
    deepStrictEqual(result, [])
  })

  it('should format a simple table with header and separator', () => {
    const result = formatTable({
      columns: [
        { header: 'Name', accessor: (r: { name: string }) => r.name },
        { header: 'Value', accessor: (r: { value: string }) => r.value },
      ],
      data: [
        { name: 'foo', value: '123' },
        { name: 'bar', value: '456' },
      ],
    })

    strictEqual(result.length, 4) // header + separator + 2 rows
    strictEqual(result[0], 'Name  Value')
    strictEqual(result[1], '-----------')
    strictEqual(result[2], 'foo   123  ')
    strictEqual(result[3], 'bar   456  ')
  })

  it('should pad columns to match longest value', () => {
    const result = formatTable({
      columns: [{ header: 'Name', accessor: (r: { name: string }) => r.name }],
      data: [{ name: 'short' }, { name: 'very long name' }],
    })

    strictEqual(result[0], 'Name          ')
    strictEqual(result[2], 'short         ')
    strictEqual(result[3], 'very long name')
  })

  it('should hide columns with visible: false', () => {
    const result = formatTable({
      columns: [
        { header: 'Name', accessor: (r: { name: string }) => r.name },
        {
          header: 'Hidden',
          accessor: (r: { hidden: string }) => r.hidden,
          visible: false,
        },
        { header: 'Value', accessor: (r: { value: string }) => r.value },
      ],
      data: [{ name: 'foo', hidden: 'secret', value: '123' }],
    })

    strictEqual(result[0], 'Name  Value')
    strictEqual(result[2], 'foo   123  ')
  })

  it('should apply format function to values', () => {
    const result = formatTable({
      columns: [
        {
          header: 'Name',
          accessor: (r: { name: string }) => r.name,
          format: (value) => `[${value}]`,
        },
      ],
      data: [{ name: 'test' }],
    })

    strictEqual(result[2], '[test]')
  })

  it('should handle ANSI colors in accessor values', () => {
    const result = formatTable({
      columns: [
        {
          header: 'Name',
          accessor: (r: { name: string }) =>
            `${COLORS.green}${r.name}${COLORS.reset}`,
        },
        { header: 'Value', accessor: (r: { value: string }) => r.value },
      ],
      data: [{ name: 'foo', value: '123' }],
    })

    // Header should not have colors
    strictEqual(result[0], 'Name  Value')
    // Row should have colors but correct padding
    strictEqual(result[2], `${COLORS.green}foo${COLORS.reset}   123  `)
  })

  describe('tree rendering', () => {
    type TreeRow = {
      name: string
      depth: number
      isLast: boolean
      hasChildren: boolean
      parentPath: boolean[]
    }

    const treeOptions = {
      getDepth: (r: TreeRow) => r.depth,
      getIsLast: (r: TreeRow) => r.isLast,
      getHasChildren: (r: TreeRow) => r.hasChildren,
      getParentPath: (r: TreeRow) => r.parentPath,
    }

    it('should not add prefix for depth 0', () => {
      const result = formatTable({
        columns: [{ header: 'Name', accessor: (r: TreeRow) => r.name }],
        data: [
          {
            name: 'root',
            depth: 0,
            isLast: true,
            hasChildren: false,
            parentPath: [],
          },
        ],
        tree: treeOptions,
      })

      strictEqual(result[2], 'root')
    })

    it('should add └── prefix for last child without children', () => {
      const result = formatTable({
        columns: [{ header: 'Name', accessor: (r: TreeRow) => r.name }],
        data: [
          {
            name: 'child',
            depth: 1,
            isLast: true,
            hasChildren: false,
            parentPath: [true],
          },
        ],
        tree: treeOptions,
      })

      // Should have prefix and grey color for depth > 0
      strictEqual(result[2], `└── ${COLORS.grey}child${COLORS.reset}`)
    })

    it('should add ├── prefix for non-last child without children', () => {
      const result = formatTable({
        columns: [{ header: 'Name', accessor: (r: TreeRow) => r.name }],
        data: [
          {
            name: 'child',
            depth: 1,
            isLast: false,
            hasChildren: false,
            parentPath: [false],
          },
        ],
        tree: treeOptions,
      })

      strictEqual(result[2], `├── ${COLORS.grey}child${COLORS.reset}`)
    })

    it('should add └─┬ prefix for last child with children', () => {
      const result = formatTable({
        columns: [{ header: 'Name', accessor: (r: TreeRow) => r.name }],
        data: [
          {
            name: 'parent',
            depth: 1,
            isLast: true,
            hasChildren: true,
            parentPath: [true],
          },
        ],
        tree: treeOptions,
      })

      strictEqual(result[2], `└─┬ ${COLORS.grey}parent${COLORS.reset}`)
    })

    it('should add ├─┬ prefix for non-last child with children', () => {
      const result = formatTable({
        columns: [{ header: 'Name', accessor: (r: TreeRow) => r.name }],
        data: [
          {
            name: 'parent',
            depth: 1,
            isLast: false,
            hasChildren: true,
            parentPath: [false],
          },
        ],
        tree: treeOptions,
      })

      strictEqual(result[2], `├─┬ ${COLORS.grey}parent${COLORS.reset}`)
    })

    it('should render nested tree with continuation lines', () => {
      const result = formatTable({
        columns: [{ header: 'Package', accessor: (r: TreeRow) => r.name }],
        data: [
          {
            name: 'root',
            depth: 0,
            isLast: false,
            hasChildren: true,
            parentPath: [],
          },
          {
            name: 'child1',
            depth: 1,
            isLast: false,
            hasChildren: true,
            parentPath: [false],
          },
          {
            name: 'grandchild',
            depth: 2,
            isLast: true,
            hasChildren: false,
            parentPath: [false, true],
          },
          {
            name: 'child2',
            depth: 1,
            isLast: true,
            hasChildren: false,
            parentPath: [true],
          },
        ],
        tree: treeOptions,
      })

      // Check prefixes and names are correct (trim trailing spaces)
      strictEqual(result[2].trimEnd(), 'root')
      strictEqual(
        result[3].trimEnd(),
        `├─┬ ${COLORS.grey}child1${COLORS.reset}`,
      )
      strictEqual(
        result[4].trimEnd(),
        `│ └── ${COLORS.grey}grandchild${COLORS.reset}`,
      )
      strictEqual(
        result[5].trimEnd(),
        `└── ${COLORS.grey}child2${COLORS.reset}`,
      )
    })

    it('should apply grey color to all columns for sub-rows', () => {
      const result = formatTable({
        columns: [
          {
            header: 'Name',
            accessor: (r: TreeRow & { version: string }) => r.name,
          },
          {
            header: 'Version',
            accessor: (r: TreeRow & { version: string }) => r.version,
          },
        ],
        data: [
          {
            name: 'child',
            version: '1.0.0',
            depth: 1,
            isLast: true,
            hasChildren: false,
            parentPath: [true],
          },
        ],
        tree: treeOptions,
      })

      // Both columns should have grey color
      strictEqual(
        result[2],
        `└── ${COLORS.grey}child${COLORS.reset}  ${COLORS.grey}1.0.0${COLORS.reset}  `,
      )
    })

    it('should not colorize whitespace-only values in sub-rows', () => {
      const result = formatTable({
        columns: [
          {
            header: 'Name',
            accessor: (r: TreeRow & { empty: string }) => r.name,
          },
          { header: 'Empty', accessor: () => '    ' },
        ],
        data: [
          {
            name: 'child',
            empty: '    ',
            depth: 1,
            isLast: true,
            hasChildren: false,
            parentPath: [true],
          },
        ],
        tree: treeOptions,
      })

      // Empty column should not have color codes around whitespace
      // The name column has the grey coloring, the empty column is just spaces
      strictEqual(
        result[2].startsWith(`└── ${COLORS.grey}child${COLORS.reset}`),
        true,
      )
      // Verify the empty column doesn't have color codes (just spaces after the name)
      const afterName = result[2].slice(
        `└── ${COLORS.grey}child${COLORS.reset}`.length,
      )
      strictEqual(afterName.includes(COLORS.grey), false)
    })
  })
})
