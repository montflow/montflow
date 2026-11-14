## Stage 0: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/apps/cli/tests/check.test.ts src/apps/cli/tests/claim.test.ts src/apps/cli/tests/migrate.test.ts src/apps/cli/tests/review-gate.test.ts src/apps/cli/tests/review-decide.test.ts src/apps/cli/tests/run-slash.test.ts src/apps/cli/tests/structure.test.ts src/modules/sizing

- [x] the previously failing scoped suites pass
