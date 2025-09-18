import { Command } from '../lib/command.ts'

export const infoCommand = new Command({
  name: 'info',
  description: 'Show information about the current project',
  usage: 'info',
  example: 'denvig info',
  args: [],
  flags: [],
  handler: async ({ project }) => {
    // Get GitHub repository URL from package.json
    let githubUrl = null
    try {
      const packageJsonPath = `${project.path}/package.json`
      const fs = await import('node:fs')
      if (fs.existsSync(packageJsonPath)) {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, 'utf-8'),
        )
        if (packageJson.repository?.url) {
          githubUrl = packageJson.repository.url
            .replace('git+', '')
            .replace('.git', '')
        }
      }
    } catch (_error) {
      // Ignore errors - GitHub URL is optional
    }

    const actions = await project.actions

    const info = {
      name: project.name,
      primaryPackageManager: project.primaryPackageManager,
      allPackageManagers: project.packageManagers,
      numberOfActions: Object.keys(actions).length,
      githubRepository: githubUrl,
    }

    console.log(`Project: ${info.name}`)
    console.log(
      `Primary Package Manager: ${info.primaryPackageManager || 'None detected'}`,
    )
    console.log(
      `All Package Managers: ${info.allPackageManagers.join(', ') || 'None detected'}`,
    )
    console.log(`Available Actions: ${info.numberOfActions}`)
    if (info.githubRepository) {
      console.log(`GitHub Repository: ${info.githubRepository}`)
    }

    return { success: true }
  },
})
