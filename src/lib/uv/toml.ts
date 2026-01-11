/**
 * Naive TOML parser for pyproject.toml and uv.lock files.
 * Only supports the subset of TOML needed for dependency parsing:
 * - Basic key-value pairs with string values
 * - Sections [section] and [section.subsection]
 * - Array of tables [[array]]
 * - Arrays of strings ["a", "b"]
 * - Arrays of inline tables [{ key = "value" }]
 * - Inline tables { key = "value" }
 * - Comments starting with #
 */

type TomlValue =
  | string
  | number
  | boolean
  | TomlValue[]
  | { [key: string]: TomlValue }

type TomlObject = { [key: string]: TomlValue }

/**
 * Parse a TOML string value (removes quotes)
 */
const parseStringValue = (value: string): string => {
  const trimmed = value.trim()
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1)
  }
  return trimmed
}

/**
 * Parse a primitive TOML value (string, number, boolean)
 */
const parsePrimitiveValue = (value: string): TomlValue => {
  const trimmed = value.trim()

  // Boolean
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false

  // Number
  if (/^-?\d+$/.test(trimmed)) {
    return Number.parseInt(trimmed, 10)
  }
  if (/^-?\d+\.\d+$/.test(trimmed)) {
    return Number.parseFloat(trimmed)
  }

  // String
  return parseStringValue(trimmed)
}

/**
 * Parse an inline table like { key = "value", key2 = "value2" }
 */
const parseInlineTable = (content: string): TomlObject => {
  const result: TomlObject = {}
  const inner = content.slice(1, -1).trim() // Remove { }

  if (!inner) return result

  // Split by comma, but respect nested structures
  const pairs: string[] = []
  let current = ''
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i]

    if (!inString && (char === '"' || char === "'")) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar && inner[i - 1] !== '\\') {
      inString = false
    }

    if (!inString) {
      if (char === '{' || char === '[') depth++
      else if (char === '}' || char === ']') depth--
      else if (char === ',' && depth === 0) {
        pairs.push(current.trim())
        current = ''
        continue
      }
    }

    current += char
  }
  if (current.trim()) pairs.push(current.trim())

  for (const pair of pairs) {
    const eqIndex = pair.indexOf('=')
    if (eqIndex === -1) continue

    const key = pair.slice(0, eqIndex).trim()
    const value = pair.slice(eqIndex + 1).trim()

    if (value.startsWith('{')) {
      result[key] = parseInlineTable(value)
    } else if (value.startsWith('[')) {
      result[key] = parseArray(value)
    } else {
      result[key] = parsePrimitiveValue(value)
    }
  }

  return result
}

/**
 * Parse an array like ["a", "b"] or [{ name = "x" }]
 */
const parseArray = (content: string): TomlValue[] => {
  const result: TomlValue[] = []
  const inner = content.slice(1, -1).trim() // Remove [ ]

  if (!inner) return result

  // Split by comma, but respect nested structures and strings
  const items: string[] = []
  let current = ''
  let depth = 0
  let inString = false
  let stringChar = ''

  for (let i = 0; i < inner.length; i++) {
    const char = inner[i]

    if (!inString && (char === '"' || char === "'")) {
      inString = true
      stringChar = char
    } else if (inString && char === stringChar && inner[i - 1] !== '\\') {
      inString = false
    }

    if (!inString) {
      if (char === '{' || char === '[') depth++
      else if (char === '}' || char === ']') depth--
      else if (char === ',' && depth === 0) {
        items.push(current.trim())
        current = ''
        continue
      }
    }

    current += char
  }
  if (current.trim()) items.push(current.trim())

  for (const item of items) {
    const trimmed = item.trim()
    if (trimmed.startsWith('{')) {
      result.push(parseInlineTable(trimmed))
    } else if (trimmed.startsWith('[')) {
      result.push(parseArray(trimmed))
    } else {
      result.push(parsePrimitiveValue(trimmed))
    }
  }

  return result
}

/**
 * Set a nested value in an object using a dotted path
 */
const setNestedValue = (
  obj: TomlObject,
  path: string[],
  value: TomlValue,
): void => {
  let current = obj
  for (let i = 0; i < path.length - 1; i++) {
    const key = path[i]
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key] as TomlObject
  }
  current[path[path.length - 1]] = value
}

/**
 * Get or create a nested object using a dotted path
 */
const getOrCreateNested = (obj: TomlObject, path: string[]): TomlObject => {
  let current = obj
  for (const key of path) {
    if (!(key in current) || typeof current[key] !== 'object') {
      current[key] = {}
    }
    current = current[key] as TomlObject
  }
  return current
}

/**
 * Parse a TOML string into an object
 */
export const parseToml = (content: string): TomlObject => {
  const result: TomlObject = {}
  const lines = content.split('\n')

  let currentSection: string[] = []
  let currentArrayTable: string[] | null = null
  let currentArrayItem: TomlObject | null = null
  let multilineArray: string | null = null
  let multilineKey: string | null = null

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i]

    // Handle multi-line arrays
    if (multilineArray !== null && multilineKey !== null) {
      multilineArray += line
      if (line.includes(']')) {
        // Find the closing bracket
        let depth = 0
        let endIndex = -1
        for (let j = 0; j < multilineArray.length; j++) {
          if (multilineArray[j] === '[') depth++
          else if (multilineArray[j] === ']') {
            depth--
            if (depth === 0) {
              endIndex = j
              break
            }
          }
        }

        if (endIndex !== -1) {
          const arrayContent = multilineArray.slice(0, endIndex + 1)
          const value = parseArray(arrayContent)

          if (currentArrayItem) {
            currentArrayItem[multilineKey] = value
          } else {
            const path = [...currentSection, multilineKey]
            setNestedValue(result, path, value)
          }

          multilineArray = null
          multilineKey = null
        }
      }
      continue
    }

    // Remove comments (but not inside strings)
    const commentIndex = line.indexOf('#')
    if (commentIndex !== -1) {
      // Check if # is inside a string
      let inString = false
      let stringChar = ''
      for (let j = 0; j < commentIndex; j++) {
        const char = line[j]
        if (!inString && (char === '"' || char === "'")) {
          inString = true
          stringChar = char
        } else if (inString && char === stringChar && line[j - 1] !== '\\') {
          inString = false
        }
      }
      if (!inString) {
        line = line.slice(0, commentIndex)
      }
    }

    line = line.trim()
    if (!line) continue

    // Array of tables [[section]]
    if (line.startsWith('[[') && line.endsWith(']]')) {
      // Save previous array item
      if (currentArrayItem && currentArrayTable) {
        const arr = getOrCreateNested(
          result,
          currentArrayTable.slice(0, -1),
        ) as TomlObject
        const lastKey = currentArrayTable[currentArrayTable.length - 1]
        if (!Array.isArray(arr[lastKey])) {
          arr[lastKey] = []
        }
        ;(arr[lastKey] as TomlValue[]).push(currentArrayItem)
      }

      currentArrayTable = line.slice(2, -2).split('.')
      currentArrayItem = {}
      currentSection = []
      continue
    }

    // Regular section [section]
    if (line.startsWith('[') && line.endsWith(']')) {
      // Save previous array item
      if (currentArrayItem && currentArrayTable) {
        const arr = getOrCreateNested(
          result,
          currentArrayTable.slice(0, -1),
        ) as TomlObject
        const lastKey = currentArrayTable[currentArrayTable.length - 1]
        if (!Array.isArray(arr[lastKey])) {
          arr[lastKey] = []
        }
        ;(arr[lastKey] as TomlValue[]).push(currentArrayItem)
        currentArrayItem = null
        currentArrayTable = null
      }

      currentSection = line.slice(1, -1).split('.')
      getOrCreateNested(result, currentSection)
      continue
    }

    // Key-value pair
    const eqIndex = line.indexOf('=')
    if (eqIndex === -1) continue

    const key = line.slice(0, eqIndex).trim()
    const value = line.slice(eqIndex + 1).trim()

    // Handle array that might span multiple lines
    if (value.startsWith('[') && !value.endsWith(']')) {
      multilineArray = value
      multilineKey = key
      continue
    }

    let parsedValue: TomlValue
    if (value.startsWith('{')) {
      parsedValue = parseInlineTable(value)
    } else if (value.startsWith('[')) {
      parsedValue = parseArray(value)
    } else {
      parsedValue = parsePrimitiveValue(value)
    }

    if (currentArrayItem) {
      currentArrayItem[key] = parsedValue
    } else {
      const path = [...currentSection, key]
      setNestedValue(result, path, parsedValue)
    }
  }

  // Save last array item
  if (currentArrayItem && currentArrayTable) {
    const arr = getOrCreateNested(
      result,
      currentArrayTable.slice(0, -1),
    ) as TomlObject
    const lastKey = currentArrayTable[currentArrayTable.length - 1]
    if (!Array.isArray(arr[lastKey])) {
      arr[lastKey] = []
    }
    ;(arr[lastKey] as TomlValue[]).push(currentArrayItem)
  }

  return result
}
