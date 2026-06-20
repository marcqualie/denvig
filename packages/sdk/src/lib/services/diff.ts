/**
 * Produce a unified-style line diff between two text blocks. Returns the
 * changed hunks — each changed line prefixed with `-` (removed) or `+`
 * (added), surrounded by a few lines of unchanged context prefixed with a
 * space. Long unchanged runs are collapsed to a single `…` marker. Returns an
 * empty array when the inputs are identical.
 *
 * @param before - Previous text.
 * @param after - New text.
 * @param context - Unchanged lines to keep around each change (default 2).
 */
export function diffLines(
  before: string,
  after: string,
  context = 2,
): string[] {
  const a = before.split('\n')
  const b = after.split('\n')
  const m = a.length
  const n = b.length

  // Longest common subsequence table, filled from the bottom-right.
  const lcs: number[][] = Array.from({ length: m + 1 }, () =>
    new Array<number>(n + 1).fill(0),
  )
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i][j] =
        a[i] === b[j]
          ? lcs[i + 1][j + 1] + 1
          : Math.max(lcs[i + 1][j], lcs[i][j + 1])
    }
  }

  // Backtrack into a flat list of edit operations.
  type Op = { type: ' ' | '-' | '+'; line: string }
  const ops: Op[] = []
  let i = 0
  let j = 0
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: ' ', line: a[i] })
      i++
      j++
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      ops.push({ type: '-', line: a[i] })
      i++
    } else {
      ops.push({ type: '+', line: b[j] })
      j++
    }
  }
  while (i < m) ops.push({ type: '-', line: a[i++] })
  while (j < n) ops.push({ type: '+', line: b[j++] })

  if (!ops.some((op) => op.type !== ' ')) return []

  // Keep changed lines plus `context` unchanged lines on either side.
  const keep = new Array<boolean>(ops.length).fill(false)
  ops.forEach((op, idx) => {
    if (op.type === ' ') return
    const from = Math.max(0, idx - context)
    const to = Math.min(ops.length - 1, idx + context)
    for (let k = from; k <= to; k++) keep[k] = true
  })

  const out: string[] = []
  let collapsed = false
  ops.forEach((op, idx) => {
    if (keep[idx]) {
      out.push(`${op.type}${op.line}`)
      collapsed = false
    } else if (!collapsed) {
      out.push(' …')
      collapsed = true
    }
  })
  return out
}
