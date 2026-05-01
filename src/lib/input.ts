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

/** Prompt the user for a free-text answer. Returns the trimmed input. */
export const prompt = (question: string): Promise<string> => {
  const rl = createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((resolve) => {
    rl.question(`${question}: `, (answer) => {
      rl.close()
      resolve(answer.trim())
    })
  })
}
