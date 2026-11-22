## Stage 0: Verification (mechanical)
command: bun run --cwd packages/skills test -- apps/cli/tests/sync.test.ts apps/sync/tests/sync.test.ts
scope: packages/skills/src/apps/cli/renderers.apps.module.ts

- [ ] `Renderers.sync` renderer tests pass (grouped summary, footer, --verbose).
