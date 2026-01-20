import { Command } from '../lib/command.ts'
import {
  constructDenvigResourceId,
  generateDenvigResourceHash,
} from '../lib/resources.ts'

export const internalsResourceHashCommand = new Command({
  name: 'internals:resource-hash',
  description: 'Generate hash for a denvig resource',
  usage: 'internals:resource-hash <resource>',
  example: 'denvig internals:resource-hash service/hello',
  args: [
    {
      name: 'resource',
      description:
        'Resource identifier (e.g., service/api, action/build, apps/web|action/dev, or full ID)',
      required: true,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'workspace',
      description: 'Workspace path (defaults to "root")',
      required: false,
      type: 'string',
    },
  ],
  handler: async ({ project, args, flags }) => {
    const resourceStr = args.resource as string
    let workspace = flags.workspace as string | undefined
    let resource = resourceStr

    // Check if it's a full ID (starts with @)
    if (resourceStr.startsWith('@')) {
      // Parse full ID: @project#workspace|resource
      const idMatch = resourceStr.match(/^@([^#]+)#([^|]+)\|(.+)$/)
      if (!idMatch) {
        if (flags.format === 'json') {
          console.log(
            JSON.stringify({
              success: false,
              error:
                'Invalid full ID format. Expected: @project#workspace|resource',
            }),
          )
        } else {
          console.error(
            'Error: Invalid full ID format. Expected: @project#workspace|resource',
          )
        }
        return { success: false, message: 'Invalid ID format' }
      }

      // Extract parts but use the current project
      workspace = idMatch[2]
      resource = idMatch[3]
    } else if (resourceStr.includes('|')) {
      // Parse inline workspace notation
      const parts = resourceStr.split('|')
      workspace = parts[0]
      resource = parts[1]
    }

    // Validate resource format
    if (!resource.startsWith('action/') && !resource.startsWith('service/')) {
      if (flags.format === 'json') {
        console.log(
          JSON.stringify({
            success: false,
            error:
              'Resource must start with "action/" or "service/" (e.g., service/api, action/build)',
          }),
        )
      } else {
        console.error(
          'Error: Resource must start with "action/" or "service/" (e.g., service/api, action/build)',
        )
      }
      return { success: false, message: 'Invalid resource format' }
    }

    const result = generateDenvigResourceHash({
      project,
      workspace,
      resource: resource as `action/${string}` | `service/${string}`,
    })

    if (flags.format === 'json') {
      console.log(JSON.stringify(result))
    } else {
      console.log(`${result.id}\n${result.hash}`)
    }

    return { success: true, message: 'Hash generated successfully' }
  },
})

export const internalsResourceIdCommand = new Command({
  name: 'internals:resource-id',
  description: 'Generate ID for a denvig resource',
  usage: 'internals:resource-id <resource>',
  example: 'denvig internals:id service/hello',
  args: [
    {
      name: 'resource',
      description:
        'Resource identifier (e.g., service/api, action/build, apps/web|action/dev)',
      required: true,
      type: 'string',
    },
  ],
  flags: [
    {
      name: 'workspace',
      description: 'Workspace path (defaults to "root")',
      required: false,
      type: 'string',
    },
  ],
  handler: async ({ project, args, flags }) => {
    const resourceStr = args.resource as string
    let workspace = flags.workspace as string | undefined
    let resource = resourceStr

    // Check if resource contains workspace notation (e.g., "apps/web|action/dev")
    if (resourceStr.includes('|')) {
      const parts = resourceStr.split('|')
      workspace = parts[0]
      resource = parts[1]
    }

    // Validate resource format
    if (!resource.startsWith('action/') && !resource.startsWith('service/')) {
      if (flags.format === 'json') {
        console.log(
          JSON.stringify({
            success: false,
            error:
              'Resource must start with "action/" or "service/" (e.g., service/api, action/build)',
          }),
        )
      } else {
        console.error(
          'Error: Resource must start with "action/" or "service/" (e.g., service/api, action/build)',
        )
      }
      return { success: false, message: 'Invalid resource format' }
    }

    const id = constructDenvigResourceId({
      project,
      workspace,
      resource: resource as `action/${string}` | `service/${string}`,
    })

    if (flags.format === 'json') {
      console.log(JSON.stringify({ id }))
    } else {
      console.log(id)
    }

    return { success: true, message: 'ID generated successfully' }
  },
})
