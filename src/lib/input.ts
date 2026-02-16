import { createInterface } from 'node:readline'

/** Prompt the user for a yes/no confirmation. Returns true if they answer "y". */
export const confirm = (prompt: string): Promise<boolean> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${prompt} [y/N] `, (answer) => {
      rl.close()
      resolve(answer.toLowerCase() === 'y')
    })
  })
}
