# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs test -- check.test.ts` passes
- [ ] `bun run --cwd packages/specs cli check --dir . --name spec-optimizations` reports zero errors and no `reviewer-profile.unknown`
- [ ] `bun run mf:check:specs` passes
