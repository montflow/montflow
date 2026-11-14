# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs cli check --dir ../.. --name spec-optimizations` reports unchecked record warnings in the grouped form
- [x] `bun run --cwd packages/specs cli check --dir fixtures --name mock-over-budget` exits 1 with `review.budget-exceeded`, naming the series, phase, budget, and round count
- [x] `bun run --cwd packages/specs cli check --dir fixtures --name mock-history` exits 0
