import { defineConfig } from 'oxlint';

export default defineConfig({
  ignorePatterns: [
    '.agents/**',
    '.github/**',
    '.pi/**',
    '.vscode/**',
    '**/build/**',
    '**/dist/**',
    '**/node_modules/**',
    'tooling/oxlint/anti-slop/**',
  ],
  env: {
    node: true,
  },
  plugins: ['typescript', 'unicorn'],
  categories: {
    correctness: 'error',
    suspicious: 'warn',
    perf: 'warn',
  },
  rules: {
    'no-debugger': 'error',

    // Vendored anti-slop: opinionated rules that reject low-evidence patterns.
    // Source: tooling/oxlint/anti-slop/ (MIT, dmmulroy/anti-slop).
    // Enabled at "error" per the install-anti-slop skill.
    'anti-slop/no-chained-type-assertions': 'error',
    'anti-slop/no-conditional-empty-object-spread': 'error',
    'anti-slop/no-module-mocking': 'error',
    'anti-slop/no-reflect-apply': 'error',
    'anti-slop/no-reflect-get': 'error',
    'anti-slop/no-shape-in-symbol-names': 'error',
    'anti-slop/no-unknown-returns': 'error',
    'anti-slop/no-unknown-type-aliases': 'error',
    'anti-slop/no-widen-then-assert': 'error',
    'anti-slop/require-safety-comment-for-type-assertion': 'error',

    // Anti-slop Effect group: service constructors stay local to their owning
    // capability modules — runtime callers import the Layer and yield the
    // contextual service. Direct enforcement of the effect-reviewer profile's
    // layer-hygiene requirement.
    'anti-slop-effect/no-service-constructor-imports': 'error',

    // Adapted to "warn" — @montflow/core is a runtime type-check / combinator
    // library: `unknown` inputs, `typeof` guards, generic object recursion,
    // and `Record<string, unknown>` dictionaries are its domain, not
    // I/O-boundary slop. anti-slop README: "change them to match your team's
    // standards".
    'anti-slop/no-known-value-widening': 'warn',
    'anti-slop/no-object-parameters': 'warn',
    'anti-slop/no-runtime-typeof': 'warn',
    'anti-slop/no-unknown-parameters': 'warn',
    'anti-slop/no-unsafe-dictionary-type': 'warn',

    // Montflow Effect rules: mechanical subset of the effect-reviewer profile.
    // Source: packages/linting/ (`@montflow/linting`).
    'montflow/no-chained-pipe': 'error',
    'montflow/no-clock-access': 'error',
    'montflow/no-data-first-effect': 'error',
    'montflow/no-global-fetch': 'error',
    'montflow/no-math-random': 'error',
    'montflow/no-node-platform-imports': 'error',
    'montflow/no-process-env': 'error',
    'montflow/no-switch-on-tag': 'error',
    'montflow/no-timers': 'error',
  },
  jsPlugins: [
    { name: 'anti-slop', specifier: './tooling/oxlint/anti-slop/index.ts' },
    { name: 'anti-slop-effect', specifier: './tooling/oxlint/anti-slop/effect/index.ts' },
    { name: 'montflow', specifier: './packages/linting/src/index.ts' },
  ],
  overrides: [
    {
      // @montflow/core is a non-Effect runtime library: wall-clock reads,
      // timers, and Math.random are its domain (same rationale as the
      // anti-slop warns above), not bypassed Effect services.
      files: ['packages/core/**'],
      rules: {
        'montflow/no-clock-access': 'off',
        'montflow/no-math-random': 'off',
        'montflow/no-timers': 'off',
      },
    },
  ],
});
