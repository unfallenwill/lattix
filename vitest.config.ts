import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

// Resolve @lattix/* to package source (not built dist) so tests run against
// current TypeScript. Mirrors the moduleNameMapper from the old jest.config.js.
const root = import.meta.dirname

export default defineConfig({
  resolve: {
    alias: [
      {
        find: /^@lattix\/(protocol|shared|core|client|tui)\/(.*)$/,
        replacement: resolve(root, 'packages/$1/src/$2'),
      },
      {
        find: /^@lattix\/(protocol|shared|core|client|tui)$/,
        replacement: resolve(root, 'packages/$1/src/index.ts'),
      },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['packages/**/__tests__/**/*.test.{ts,tsx}'],
    coverage: {
      provider: 'v8',
      include: ['packages/*/src/**/*.{ts,tsx}'],
      exclude: ['packages/**/__tests__/**', 'packages/**/dist/**', '**/*.d.ts'],
      reporter: ['text', 'html'],
      // Enforce the 80% gate. Branches sit a bit lower so the bar reflects
      // current reality; nudge upward as new tests land.
      thresholds: {
        statements: 80,
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
