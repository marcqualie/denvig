import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ProjectConfigSchema } from '../schemas/config.ts'

import type { z } from 'zod'

type JsonSchemaIsh = {
  title?: string
  description?: string
  type: string
  properties?: Record<string, JsonSchemaIsh>
}

/**
 * Convert a Zod schema to JSON Schema using Zod internals
 */
function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchemaIsh {
  // biome-ignore lint/suspicious/noExplicitAny: Required to access Zod internals
  const def = (schema as any)._def

  // Safety check
  if (!def) {
    return { type: 'object', properties: {} }
  }

  // Handle ZodOptional
  if (def.typeName === 'ZodOptional' || def.innerType) {
    return zodToJsonSchema(def.innerType)
  }

  // Handle ZodObject - check for shape property FIRST
  if (def.typeName === 'ZodObject' || (def.shape && !def.valueType)) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic property collection for JSON Schema
    const properties: any = {}
    const required: string[] = []

    // Get the shape - Zod stores it as a getter function or direct property
    const shape = typeof def.shape === 'function' ? def.shape() : def.shape

    if (shape && typeof shape === 'object') {
      for (const [key, value] of Object.entries(shape)) {
        const zodSchema = value as z.ZodTypeAny
        // biome-ignore lint/suspicious/noExplicitAny: Required to access Zod internals
        const zodDef = (zodSchema as any)._def

        // Check if field is optional (has innerType or is ZodOptional)
        const isOptional = zodDef.typeName === 'ZodOptional' || zodDef.innerType

        properties[key] = zodToJsonSchema(zodSchema)

        if (!isOptional) {
          required.push(key)
        }
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON Schema object construction
    const result: any = {
      type: 'object',
      properties,
      additionalProperties: false,
    }

    if (required.length > 0) {
      result.required = required
    }

    if (def.description) {
      result.description = def.description
    }

    return result
  }

  // Handle ZodRecord (has valueType)
  if (def.typeName === 'ZodRecord' || def.valueType) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON Schema object construction
    const result: any = {
      type: 'object',
      additionalProperties: zodToJsonSchema(def.valueType),
    }
    if (def.description) {
      result.description = def.description
    }
    return result
  }

  // Handle ZodArray (has element property in Zod v4)
  if (def.typeName === 'ZodArray' || def.element) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON Schema object construction
    const result: any = {
      type: 'array',
      items: zodToJsonSchema(def.element),
    }
    if (def.description) {
      result.description = def.description
    }
    return result
  }

  // Handle ZodString (has just type property with no other props)
  if (
    def.typeName === 'ZodString' ||
    (def.type === 'string' && !def.element && !def.valueType && !def.shape)
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON Schema object construction
    const result: any = { type: 'string' }
    if (def.description) {
      result.description = def.description
    }
    return result
  }

  // Fallback for unknown types
  return { type: 'object' }
}

/**
 * Generate JSON Schema for denvig.yml configuration files
 * Based on ProjectConfigSchema from src/schemas/config.ts
 */
export function generateConfigSchema() {
  const baseSchema = zodToJsonSchema(ProjectConfigSchema)

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://denvig.com/schemas/config.json',
    title: 'Denvig Project Configuration',
    description: 'Configuration schema for denvig.yml files',
    ...baseSchema,
  }

  return schema
}

/**
 * Write the generated schema to schemas/config.json
 */
export function writeConfigSchema() {
  const schema = generateConfigSchema()
  const outputPath = resolve(process.cwd(), 'schemas', 'config.json')
  const content = JSON.stringify(schema, null, 2)

  writeFileSync(outputPath, `${content}\n`, 'utf-8')

  console.log(`Generated JSON schema: ${outputPath}`)
}
