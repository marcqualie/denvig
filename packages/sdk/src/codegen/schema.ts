import { writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

import { GlobalConfigSchema, ProjectConfigSchema } from '../schemas/config.ts'

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
 */
export const zodToJsonSchema = (schema: z.ZodTypeAny): JsonSchemaIsh => {
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

    // Extract key constraints for propertyNames using Zod's built-in toJSONSchema
    if (def.keyType?.toJSONSchema) {
      const keySchema = def.keyType.toJSONSchema()
      // Remove $schema as it's not needed for propertyNames
      const { $schema, ...propertyNames } = keySchema
      // Only add propertyNames if there are constraints beyond type
      if (propertyNames.maxLength || propertyNames.pattern) {
        result.propertyNames = propertyNames
      }
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

  // Handle ZodEnum (has entries object mapping values to themselves)
  if (def.type === 'enum' && def.entries) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON Schema object construction
    const result: any = {
      type: 'string',
      enum: Object.keys(def.entries),
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

  // Handle ZodNumber (Zod v4 stores type in def.type)
  if (
    def.typeName === 'ZodNumber' ||
    (def.type === 'number' && !def.element && !def.valueType && !def.shape)
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON Schema object construction
    const result: any = { type: 'number' }
    if (description) {
      result.description = description
    }
    return result
  }

  // Handle ZodBoolean (Zod v4 stores type in def.type)
  if (
    def.typeName === 'ZodBoolean' ||
    (def.type === 'boolean' && !def.element && !def.valueType && !def.shape)
  ) {
    // biome-ignore lint/suspicious/noExplicitAny: Dynamic JSON Schema object construction
    const result: any = { type: 'boolean' }
    if (description) {
      result.description = description
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
 * Generate JSON Schema for global configuration files
 * Based on GlobalConfigSchema from src/schemas/config.ts
 */
export function generateGlobalConfigSchema() {
  const baseSchema = zodToJsonSchema(GlobalConfigSchema)

  const schema = {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $id: 'https://denvig.com/schemas/config.global.json',
    title: 'Denvig Global Configuration',
    description: 'Configuration schema for global denvig config files',
    ...baseSchema,
  }

  return schema
}

/**
 * Write the generated schemas to schemas directory
 */
export async function writeConfigSchema() {
  // Write project config schema
  const projectSchema = generateConfigSchema()
  const projectOutputPath = resolve(process.cwd(), 'schemas', 'config.json')
  const projectContent = JSON.stringify(projectSchema, null, 2)

  await writeFile(projectOutputPath, `${projectContent}\n`, 'utf-8')

  console.log(`Generated JSON schema: ${projectOutputPath}`)

  // Write global config schema
  const globalSchema = generateGlobalConfigSchema()
  const globalOutputPath = resolve(
    process.cwd(),
    'schemas',
    'config.global.json',
  )
  const globalContent = JSON.stringify(globalSchema, null, 2)

  await writeFile(globalOutputPath, `${globalContent}\n`, 'utf-8')

  console.log(`Generated JSON schema: ${globalOutputPath}`)
}
