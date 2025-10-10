/**
 * Test fixtures and utilities for codegen tests
 * This file exposes internal functions for testing purposes
 */

import type { z } from 'zod'

type JsonSchemaIsh = {
  title?: string
  description?: string
  type: string
  properties?: Record<string, JsonSchemaIsh>
  additionalProperties?: boolean | JsonSchemaIsh
  required?: string[]
  items?: JsonSchemaIsh
}

/**
 * Convert a Zod schema to JSON Schema using Zod internals
 * This is a copy of the internal function from schema.ts for testing purposes
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): JsonSchemaIsh {
  // biome-ignore lint/suspicious/noExplicitAny: Required to access Zod internals
  const def = (schema as any)._def
  // biome-ignore lint/suspicious/noExplicitAny: Access description property from Zod v4
  const description = (schema as any).description

  // Safety check
  if (!def) {
    return { type: 'object', properties: {} }
  }

  // Handle ZodOptional - preserve description from optional wrapper
  if (def.typeName === 'ZodOptional' || def.innerType) {
    const innerSchema = zodToJsonSchema(def.innerType)
    // If the optional wrapper has a description, use it
    if (description && !innerSchema.description) {
      innerSchema.description = description
    }
    return innerSchema
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

    if (description) {
      result.description = description
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
    if (description) {
      result.description = description
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
    if (description) {
      result.description = description
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
    if (description) {
      result.description = description
    }
    return result
  }

  // Fallback for unknown types
  return { type: 'object' }
}
