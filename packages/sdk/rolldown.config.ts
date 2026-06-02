import { defineConfig } from 'rolldown'
import { dts } from 'rolldown-plugin-dts'

const externalDeps = ['node-forge', 'semver', 'yaml', 'zod']
const isExternal = (id: string) =>
  externalDeps.some((dep) => id === dep || id.startsWith(`${dep}/`))

export default defineConfig([
  // SDK - ESM bundle + bundled .d.ts
  {
    input: 'src/index.ts',
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
    input: 'src/index.ts',
    platform: 'node',
    external: isExternal,
    output: {
      file: 'dist/index.cjs',
      format: 'cjs',
      minify: true,
      sourcemap: false,
      codeSplitting: false,
    },
  },
])
