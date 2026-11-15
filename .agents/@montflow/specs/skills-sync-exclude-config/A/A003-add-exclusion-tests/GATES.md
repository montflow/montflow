# GATES

## Stage 0: Exclusion tests pass (mechanical)
command: bun run --cwd packages/skills test -- src/apps/sync/tests/sync.test.ts
scope: packages/skills/src/apps/sync/tests/

- [ ] The exclusion tests pass: excluded skill (skipped/excluded, local copy preserved, clean check), unknown name (warning), missing config (no behavior change).
- [ ] The existing `internal` skip and other sync tests still pass.