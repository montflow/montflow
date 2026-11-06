# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs test -- check.test.ts` passes
- [x] `bun run --cwd packages/specs cli check --dir . --name spec-optimizations` reports zero errors and no `reviewer-profile.unknown`
- [x] `bun run mf:check:specs` passes
