/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    // === Global Rules ===

    {
      name: 'no-circular',
      comment: 'No circular dependencies',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      comment: 'No orphan modules (unreachable from a package index.ts)',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: '\\.test\\.(ts|tsx)$',
      },
      to: {},
    },
    {
      name: 'no-test-in-prod',
      severity: 'error',
      comment: 'Production code must not import test code',
      from: { pathNot: '(__tests__|tests)/' },
      to: { path: '(__tests__|tests)/' },
    },

    // === Layer Rules (cross-package) ===
    //
    //   packages/
    //     protocol/  → frames, methods, errors (foundational, no upward deps)
    //     shared/    → domain types, FieldRegistry (may import from protocol)
    //     client/    → WebSocket SDK (may import from protocol, shared)
    //     core/      → server-side engine (may import from protocol, shared)
    //     tui/       → TUI client (may import from protocol, shared, client)
    //
    // Layer rules apply to PRODUCTION code only — __tests__/ may import any
    // package (e.g. for cross-package integration tests over a real socket).

    {
      name: 'protocol-no-upward-imports',
      severity: 'error',
      comment: 'protocol/ is foundational — must not import from other packages',
      from: { path: '^packages/protocol/', pathNot: '__tests__/' },
      to: { path: '^packages/(?!protocol/)' },
    },
    {
      name: 'shared-may-import-protocol-only',
      severity: 'error',
      comment: 'shared/ may only import from protocol/',
      from: { path: '^packages/shared/', pathNot: '__tests__/' },
      to: { path: '^packages/(?!shared/|protocol/)' },
    },
    {
      name: 'client-may-import-shared-and-protocol',
      severity: 'error',
      comment: 'client/ may import from shared/ and protocol/ only',
      from: { path: '^packages/client/', pathNot: '__tests__/' },
      to: { path: '^packages/(?!client/|shared/|protocol/)' },
    },
    {
      name: 'core-may-import-shared-and-protocol',
      severity: 'error',
      comment: 'core/ may import from shared/ and protocol/ only',
      from: { path: '^packages/core/', pathNot: '__tests__/' },
      to: { path: '^packages/(?!core/|shared/|protocol/)' },
    },
    {
      name: 'tui-may-import-client-shared-protocol',
      severity: 'error',
      comment: 'tui/ may import from client/, shared/, and protocol/ only',
      from: { path: '^packages/tui/', pathNot: '__tests__/' },
      to: { path: '^packages/(?!tui/|client/|shared/|protocol/)' },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    doNotFollow: {
      path: 'node_modules',
    },
    exclude: {
      path: 'packages/.*/dist',
    },
    moduleSystems: ['es6', 'amd'],
  },
}
