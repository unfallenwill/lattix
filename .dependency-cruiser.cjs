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
      comment: 'No orphan modules (unreachable from index.tsx)',
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
      from: { pathNot: '^(__tests__|tests)/' },
      to: { path: '^(__tests__|tests)/' },
    },

    // === Layer Rules ===
    //
    // Architecture:
    //   src/
    //     index.tsx       → entry point (imports app, components, utils, store, types)
    //     app.tsx         → main app component (imports components, utils, store, types)
    //     components/     → React components (imports utils, store, types)
    //     utils/         → foundation (no upward imports)
    //     store.ts, types.ts → shared modules

    {
      name: 'utils-no-upward-imports',
      severity: 'error',
      comment:
        'utils/ is foundational — must not import from components/, app.tsx, or index.tsx',
      from: { path: '^src/utils/' },
      to: {
        path: ['^src/components/', '^src/app\\.tsx$', '^src/index\\.tsx$'],
      },
    },

    {
      name: 'components-no-app-imports',
      severity: 'error',
      comment:
        'components/ should not import from app.tsx or index.tsx (avoid circularity)',
      from: { path: '^src/components/' },
      to: {
        path: ['^src/app\\.tsx$', '^src/index\\.tsx$'],
      },
    },

    {
      name: 'index-only-entry',
      severity: 'error',
      comment:
        'index.tsx should only import from app.tsx, components/, utils/, store, and types',
      from: { path: '^src/index\\.tsx$' },
      to: {
        path: '^src/',
        pathNot: [
          '^src/app\\.tsx$',
          '^src/components/',
          '^src/utils/',
          '^src/store\\.ts$',
          '^src/types\\.ts$',
        ],
      },
    },

    {
      name: 'app-only-structured-imports',
      severity: 'error',
      comment:
        'app.tsx should only import from components/, utils/, store, and types',
      from: { path: '^src/app\\.tsx$' },
      to: {
        path: '^src/',
        pathNot: [
          '^src/components/',
          '^src/utils/',
          '^src/store\\.ts$',
          '^src/types\\.ts$',
        ],
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    combinedDependencies: false,
    doNotFollow: {
      path: 'node_modules',
    },
    moduleSystems: ['es6'],
  },
}
