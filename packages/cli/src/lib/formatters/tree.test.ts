import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'

import { COLORS } from './table.ts'
import { formatTree, mergeTreeNode, type TreeNode } from './tree.ts'

describe('formatTree()', () => {
  it('should format a single root node', () => {
    const node: TreeNode = { name: 'root', version: '1.0.0', children: [] }
    const result = formatTree(node)

    deepStrictEqual(result, [`root ${COLORS.grey}1.0.0${COLORS.reset}`])
  })

  it('should format root with one child', () => {
    const node: TreeNode = {
      name: 'root',
      version: '1.0.0',
      children: [{ name: 'child', version: '2.0.0', children: [] }],
    }
    const result = formatTree(node)

    deepStrictEqual(result, [
      `root ${COLORS.grey}1.0.0${COLORS.reset}`,
      `└── child ${COLORS.grey}2.0.0${COLORS.reset}`,
    ])
  })

  it('should format root with multiple children', () => {
    const node: TreeNode = {
      name: 'root',
      version: '1.0.0',
      children: [
        { name: 'child1', version: '2.0.0', children: [] },
        { name: 'child2', version: '3.0.0', children: [] },
      ],
    }
    const result = formatTree(node)

    deepStrictEqual(result, [
      `root ${COLORS.grey}1.0.0${COLORS.reset}`,
      `├── child1 ${COLORS.grey}2.0.0${COLORS.reset}`,
      `└── child2 ${COLORS.grey}3.0.0${COLORS.reset}`,
    ])
  })

  it('should use ├─┬ for non-last child with children', () => {
    const node: TreeNode = {
      name: 'root',
      version: '1.0.0',
      children: [
        {
          name: 'parent1',
          version: '2.0.0',
          children: [{ name: 'grandchild', version: '3.0.0', children: [] }],
        },
        { name: 'child2', version: '4.0.0', children: [] },
      ],
    }
    const result = formatTree(node)

    deepStrictEqual(result, [
      `root ${COLORS.grey}1.0.0${COLORS.reset}`,
      `├─┬ parent1 ${COLORS.grey}2.0.0${COLORS.reset}`,
      `│ └── grandchild ${COLORS.grey}3.0.0${COLORS.reset}`,
      `└── child2 ${COLORS.grey}4.0.0${COLORS.reset}`,
    ])
  })

  it('should use └─┬ for last child with children', () => {
    const node: TreeNode = {
      name: 'root',
      version: '1.0.0',
      children: [
        {
          name: 'parent',
          version: '2.0.0',
          children: [{ name: 'grandchild', version: '3.0.0', children: [] }],
        },
      ],
    }
    const result = formatTree(node)

    deepStrictEqual(result, [
      `root ${COLORS.grey}1.0.0${COLORS.reset}`,
      `└─┬ parent ${COLORS.grey}2.0.0${COLORS.reset}`,
      `  └── grandchild ${COLORS.grey}3.0.0${COLORS.reset}`,
    ])
  })

  it('should render continuation lines correctly for deep nesting', () => {
    const node: TreeNode = {
      name: 'root',
      version: '1.0.0',
      children: [
        {
          name: 'a',
          version: '1.0.0',
          children: [
            {
              name: 'b',
              version: '1.0.0',
              children: [{ name: 'c', version: '1.0.0', children: [] }],
            },
          ],
        },
        { name: 'd', version: '1.0.0', children: [] },
      ],
    }
    const result = formatTree(node)

    deepStrictEqual(result, [
      `root ${COLORS.grey}1.0.0${COLORS.reset}`,
      `├─┬ a ${COLORS.grey}1.0.0${COLORS.reset}`,
      `│ └─┬ b ${COLORS.grey}1.0.0${COLORS.reset}`,
      `│   └── c ${COLORS.grey}1.0.0${COLORS.reset}`,
      `└── d ${COLORS.grey}1.0.0${COLORS.reset}`,
    ])
  })

  it('should handle complex tree with multiple branches', () => {
    const node: TreeNode = {
      name: 'tsup',
      version: '8.5.1',
      children: [
        {
          name: 'sucrase',
          version: '3.35.0',
          children: [
            {
              name: 'glob',
              version: '10.4.5',
              children: [
                { name: 'minipass', version: '7.1.2', children: [] },
                {
                  name: 'path-scurry',
                  version: '1.11.1',
                  children: [
                    { name: 'minipass', version: '7.1.2', children: [] },
                  ],
                },
              ],
            },
          ],
        },
      ],
    }
    const result = formatTree(node)

    deepStrictEqual(result, [
      `tsup ${COLORS.grey}8.5.1${COLORS.reset}`,
      `└─┬ sucrase ${COLORS.grey}3.35.0${COLORS.reset}`,
      `  └─┬ glob ${COLORS.grey}10.4.5${COLORS.reset}`,
      `    ├── minipass ${COLORS.grey}7.1.2${COLORS.reset}`,
      `    └─┬ path-scurry ${COLORS.grey}1.11.1${COLORS.reset}`,
      `      └── minipass ${COLORS.grey}7.1.2${COLORS.reset}`,
    ])
  })
})

describe('mergeTreeNode()', () => {
  it('should add node to empty array', () => {
    const trees: TreeNode[] = []
    const node: TreeNode = { name: 'root', version: '1.0.0', children: [] }

    mergeTreeNode(trees, node)

    strictEqual(trees.length, 1)
    strictEqual(trees[0].name, 'root')
    strictEqual(trees[0].version, '1.0.0')
  })

  it('should add non-matching node to array', () => {
    const trees: TreeNode[] = [
      { name: 'existing', version: '1.0.0', children: [] },
    ]
    const node: TreeNode = { name: 'new', version: '2.0.0', children: [] }

    mergeTreeNode(trees, node)

    strictEqual(trees.length, 2)
    strictEqual(trees[0].name, 'existing')
    strictEqual(trees[1].name, 'new')
  })

  it('should not duplicate matching root nodes', () => {
    const trees: TreeNode[] = [{ name: 'root', version: '1.0.0', children: [] }]
    const node: TreeNode = { name: 'root', version: '1.0.0', children: [] }

    mergeTreeNode(trees, node)

    strictEqual(trees.length, 1)
  })

  it('should merge children of matching nodes', () => {
    const trees: TreeNode[] = [
      {
        name: 'root',
        version: '1.0.0',
        children: [{ name: 'child1', version: '1.0.0', children: [] }],
      },
    ]
    const node: TreeNode = {
      name: 'root',
      version: '1.0.0',
      children: [{ name: 'child2', version: '2.0.0', children: [] }],
    }

    mergeTreeNode(trees, node)

    strictEqual(trees.length, 1)
    strictEqual(trees[0].children.length, 2)
    strictEqual(trees[0].children[0].name, 'child1')
    strictEqual(trees[0].children[1].name, 'child2')
  })

  it('should recursively merge deep children', () => {
    const trees: TreeNode[] = [
      {
        name: 'root',
        version: '1.0.0',
        children: [
          {
            name: 'child',
            version: '1.0.0',
            children: [{ name: 'grandchild1', version: '1.0.0', children: [] }],
          },
        ],
      },
    ]
    const node: TreeNode = {
      name: 'root',
      version: '1.0.0',
      children: [
        {
          name: 'child',
          version: '1.0.0',
          children: [{ name: 'grandchild2', version: '2.0.0', children: [] }],
        },
      ],
    }

    mergeTreeNode(trees, node)

    strictEqual(trees.length, 1)
    strictEqual(trees[0].children.length, 1)
    strictEqual(trees[0].children[0].children.length, 2)
    strictEqual(trees[0].children[0].children[0].name, 'grandchild1')
    strictEqual(trees[0].children[0].children[1].name, 'grandchild2')
  })

  it('should not merge nodes with different versions', () => {
    const trees: TreeNode[] = [{ name: 'root', version: '1.0.0', children: [] }]
    const node: TreeNode = { name: 'root', version: '2.0.0', children: [] }

    mergeTreeNode(trees, node)

    strictEqual(trees.length, 2)
    strictEqual(trees[0].version, '1.0.0')
    strictEqual(trees[1].version, '2.0.0')
  })
})
