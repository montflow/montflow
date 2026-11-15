## Stage 0: Verification (mechanical)
command: bun run --cwd packages/skills test -- apps/cli/tests/sync.test.ts apps/sync/tests/sync.test.ts
scope: packages/skills/src/apps/cli/tests/sync.test.ts,packages/skills/src/apps/sync/tests/sync.test.ts

- [ ] Sync renderer, engine, and end-to-end tests pass.
