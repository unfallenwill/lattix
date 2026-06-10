export default {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/packages'],
  testMatch: ['**/__tests__/**/*.test.ts', '**/__tests__/**/*.test.tsx'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: { jsx: 'react-jsx' },
      },
    ],
  },
  extensionsToTreatAsEsm: ['.ts', '.tsx'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@lattix/(protocol|shared|core|client|tui)$': '<rootDir>/packages/$1/src/index.ts',
    '^@lattix/(protocol|shared|core|client|tui)/(.*)$': '<rootDir>/packages/$1/src/$2',
  },
  collectCoverageFrom: [
    'packages/**/*.ts',
    '!packages/**/*.d.ts',
    '!packages/**/__tests__/**',
    '!packages/**/dist/**',
  ],
  verbose: true,
}
