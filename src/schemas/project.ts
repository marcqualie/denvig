import { z } from 'npm:zod'

export const ProjectDependencySchema = z.object({
  id: z.string().describe('Unique identifier for the ecosystem / dependency'),
  name: z.string().describe('Name of the dependency'),
  versions: z
    .array(z.string())
    .describe('List of versions available for the dependency'),
  ecosystem: z
    .string()
    .describe('Ecosystem of the dependency (e.g., npm, rubygems, pip)'),
})

export const ProjectSchema = z.object({
  slug: z
    .string()
    .describe(
      'Unique slug for the project. This is a combination of the GitHub organisation and repository name, e.g., marcqualie/denvig',
    ),
  name: z.string().describe('Unique identifier for the project'),
  path: z.string().describe('Absolute path to the project directory'),
  dependencies: z
    .array(ProjectDependencySchema)
    .describe('List of dependencies for the project.'),
})

export type ProjectSchema = z.infer<typeof ProjectSchema>
