## Stage 0: Verification (mechanical)
command: bun run --cwd packages/skills test -- apps/cli/tests/sync.test.ts
scope: packages/skills/src/apps/cli/binary.apps.module.ts,packages/skills/src/apps/cli/slash.apps.module.ts

- [ ] Binary and slash sync handlers print the same summary and set the right exit code.
