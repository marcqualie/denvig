/**
 * Remove deduplicated dependencies from yarn.lock source.
 */
export const prepareYarnRemovals = (
  source: string,
  removals: Record<string, string[]>,
): string => {
  const newBlocks: string[] = []

  const blocks = source.split('\n\n')
  for (const block of blocks) {
    const lines = block.split('\n')
    if (lines.length < 3) {
      newBlocks.push(block)
      continue
    }
    const definitions = lines[0]
      .split(',')
      .map((definition) => definition.trim().replace(/"|:/g, ''))
    const version = lines[1]?.match(/version "(.+)"/)?.[1]
    const resolved = lines[2]?.match(/resolved "(.+)"/)?.[1]
    const pattern = /^(@?.+)@(.+)$/
    if (!version || !resolved || definitions.length === 0) {
      newBlocks.push(block)
      continue
    }

    const [, dependencyName] = definitions[0].match(pattern) || []
    const shouldBeRemoved = removals[dependencyName]?.includes(version)

    if (!shouldBeRemoved) {
      newBlocks.push(block)
    }
  }

  return newBlocks.join('\n\n')
}
