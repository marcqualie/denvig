import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const externalDeps = ['node-forge', 'semver', 'yaml', 'zod']
const isExternal = (id: string) =>
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`))

export default defineConfig([
  // CLI - CJS only
  {
    input: 'src/cli.ts',
    platform: 'node',
    external: isExternal,
    output: {
      file: 'dist/cli.cjs',
      format: 'cjs',
      minify: true,
      sourcemap: false,
      codeSplitting: false,
    },
  },
  // SDK - ESM bundle + bundled .d.ts
  {
    input: 'src/sdk.ts',
    platform: 'node',
    external: isExternal,
    plugins: [dts()],
    output: {
      dir: 'dist',
      format: 'es',
      minify: true,
      sourcemap: false,
      codeSplitting: false,
      entryFileNames: '[name].js',
    },
  },
  // SDK - CJS bundle
  {
    input: 'src/sdk.ts',
    platform: 'node',
    external: isExternal,
    output: {
      file: 'dist/sdk.cjs',
      format: 'cjs',
      minify: true,
      sourcemap: false,
      codeSplitting: false,
    },
  },
])
