# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli check --dir ../.. --name spec-optimizations` reports unchecked record warnings in the grouped form
- [ ] `bun run --cwd packages/specs cli check --dir fixtures --name mock-over-budget` exits 1 with `review.budget-exceeded`, naming the series, phase, budget, and round count
- [ ] `bun run --cwd packages/specs cli check --dir fixtures --name mock-history` exits 0
