import { defineConfig } from 'tsdown'

// cli.tsx is the `lattix` bin; tsdown preserves its shebang + exec bit.
// JSX transform follows tsconfig (jsx: react-jsx).
export default defineConfig({
  entry: ['src/index.ts', 'src/cli.tsx'],
  format: 'esm',
  platform: 'node',
  dts: true,
  clean: true,
  fixedExtension: false,
})
