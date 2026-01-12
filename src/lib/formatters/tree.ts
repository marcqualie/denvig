import { COLORS } from './table.ts'

/**
 * A node in a tree structure for rendering.
 */
export type TreeNode = {
  name: string
  version: string
  children: TreeNode[]
}

/**
 * Format a tree node as an array of strings with proper indentation and tree characters.
 */
export const formatTree = (
  node: TreeNode,
  prefix = '',
  isLast = true,
  isRoot = true,
): string[] => {
  const lines: string[] = []
  const hasChildren = node.children.length > 0

  if (isRoot) {
    // Root nodes don't get tree prefixes
    lines.push(`${node.name} ${COLORS.grey}${node.version}${COLORS.reset}`)
  } else {
    // Non-root nodes get tree prefixes
    const branch = hasChildren
      ? isLast
        ? '└─┬ '
        : '├─┬ '
      : isLast
        ? '└── '
        : '├── '

    lines.push(
      `${prefix}${branch}${node.name} ${COLORS.grey}${node.version}${COLORS.reset}`,
    )
  }

  // Format children
  const childPrefix = isRoot ? '' : prefix + (isLast ? '  ' : '│ ')

  for (let i = 0; i < node.children.length; i++) {
    const child = node.children[i]
    const childIsLast = i === node.children.length - 1
    lines.push(...formatTree(child, childPrefix, childIsLast, false))
  }

  return lines
}

/**
 * Merge a node into an existing tree, combining common prefixes.
 */
export const mergeTreeNode = (trees: TreeNode[], node: TreeNode): void => {
  // Look for an existing tree with the same root
  const existing = trees.find(
    (t) => t.name === node.name && t.version === node.version,
  )

  if (existing) {
    // Merge children
    for (const child of node.children) {
      mergeTreeNode(existing.children, child)
    }
  } else {
    trees.push(node)
  }
}
