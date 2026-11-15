# GATES

## Stage 0: Config-read compiles (mechanical)
command: bun run --cwd packages/skills ts:check
scope: packages/skills/src/apps/sync/

- [ ] The config-read and `exclude`-parse code in the sync engine type-checks.
- [ ] The exclusion set threads into the engine's data flow with no type errors.