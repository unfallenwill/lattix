import { defineConfig } from 'tsdown'

// cli.ts is the `lattix-core` bin; tsdown preserves its shebang + exec bit.
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.ts'],
  format: 'esm',
  platform: 'node',
  dts: true,
  clean: true,
  fixedExtension: false,
})
