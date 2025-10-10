import { deepStrictEqual, strictEqual } from 'node:assert'
import { describe, it } from 'node:test'
import { z } from 'zod'

import { generateConfigSchema } from './schema.ts'
import { zodToJsonSchema } from './testFixtures.ts'

describe('zodToJsonSchema()', () => {
  describe('basic types', () => {
    it('should convert ZodString to JSON Schema', () => {
      const schema = z.string()
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'string',
      })
    })

    it('should convert ZodString with description to JSON Schema', () => {
      const schema = z.string().describe('A test string')
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'string',
        description: 'A test string',
      })
    })
  })

  describe('object types', () => {
    it('should convert simple ZodObject to JSON Schema', () => {
      const schema = z.object({
        name: z.string(),
        age: z.string(),
      })
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'string' },
        },
        additionalProperties: false,
        required: ['name', 'age'],
      })
    })

    it('should convert ZodObject with optional fields', () => {
      const schema = z.object({
        name: z.string(),
        age: z.string().optional(),
      })
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        properties: {
          name: { type: 'string' },
          age: { type: 'string' },
        },
        additionalProperties: false,
        required: ['name'],
      })
    })

    it('should convert nested ZodObject', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string(),
        }),
      })
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        properties: {
          user: {
            type: 'object',
            properties: {
              name: { type: 'string' },
              email: { type: 'string' },
            },
            additionalProperties: false,
            required: ['name', 'email'],
          },
        },
        additionalProperties: false,
        required: ['user'],
      })
    })

    it('should convert ZodObject with description', () => {
      const schema = z
        .object({
          name: z.string(),
        })
        .describe('A user object')
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        properties: {
          name: { type: 'string' },
        },
        additionalProperties: false,
        required: ['name'],
        description: 'A user object',
      })
    })
  })

  describe('array types', () => {
    it('should convert ZodArray of strings to JSON Schema', () => {
      const schema = z.array(z.string())
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'array',
        items: { type: 'string' },
      })
    })

    it('should convert ZodArray of objects to JSON Schema', () => {
      const schema = z.array(
        z.object({
          id: z.string(),
          name: z.string(),
        }),
      )
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            name: { type: 'string' },
          },
          additionalProperties: false,
          required: ['id', 'name'],
        },
      })
    })

    it('should convert ZodArray with description', () => {
      const schema = z.array(z.string()).describe('List of tags')
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'array',
        items: { type: 'string' },
        description: 'List of tags',
      })
    })
  })

  describe('record types', () => {
    it('should convert ZodRecord of strings to JSON Schema', () => {
      const schema = z.record(z.string(), z.string())
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        additionalProperties: { type: 'string' },
      })
    })

    it('should convert ZodRecord of objects to JSON Schema', () => {
      const schema = z.record(
        z.string(),
        z.object({
          command: z.string(),
        }),
      )
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        additionalProperties: {
          type: 'object',
          properties: {
            command: { type: 'string' },
          },
          additionalProperties: false,
          required: ['command'],
        },
      })
    })

    it('should convert ZodRecord with description', () => {
      const schema = z
        .record(z.string(), z.string())
        .describe('Environment variables')
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        additionalProperties: { type: 'string' },
        description: 'Environment variables',
      })
    })
  })

  describe('complex nested types', () => {
    it('should convert complex schema with all types', () => {
      const schema = z.object({
        name: z.string(),
        tags: z.array(z.string()).optional(),
        config: z
          .object({
            debug: z.string(),
            verbose: z.string().optional(),
          })
          .optional(),
        actions: z.record(
          z.string(),
          z.object({
            command: z.string(),
          }),
        ),
      })
      const result = zodToJsonSchema(schema)

      deepStrictEqual(result, {
        type: 'object',
        properties: {
          name: {
            type: 'string',
          },
          tags: {
            type: 'array',
            items: { type: 'string' },
          },
          config: {
            type: 'object',
            properties: {
              debug: { type: 'string' },
              verbose: { type: 'string' },
            },
            additionalProperties: false,
            required: ['debug'],
          },
          actions: {
            type: 'object',
            additionalProperties: {
              type: 'object',
              properties: {
                command: { type: 'string' },
              },
              additionalProperties: false,
              required: ['command'],
            },
          },
        },
        additionalProperties: false,
        required: ['name', 'actions'],
      })
    })
  })
})

describe('generateConfigSchema()', () => {
  it('should generate JSON Schema for ProjectConfigSchema', () => {
    const schema = generateConfigSchema()

    // Verify required properties
    strictEqual(schema.$schema, 'http://json-schema.org/draft-07/schema#')
    strictEqual(schema.$id, 'https://denvig.com/schemas/config.json')
    strictEqual(schema.title, 'Denvig Project Configuration')
    strictEqual(schema.description, 'Configuration schema for denvig.yml files')
    strictEqual(schema.type, 'object')

    // Verify that it has the expected properties from ProjectConfigSchema
    strictEqual(typeof schema.properties, 'object')
    strictEqual(schema.properties?.name?.type, 'string')
    strictEqual(schema.properties?.actions?.type, 'object')
    strictEqual(schema.properties?.quickActions?.type, 'array')

    // Verify that name is required
    strictEqual(Array.isArray(schema.required), true)
    strictEqual(schema.required?.includes('name'), true)
  })
})
