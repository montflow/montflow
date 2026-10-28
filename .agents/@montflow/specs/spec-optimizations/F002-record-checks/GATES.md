# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli check --dir . --name spec-optimizations` reports unchecked record warnings in the grouped form
- [ ] A synthetic series with four rounds for a tiny phase fails with the budget and count
- [ ] A synthetic series exactly at budget stays green
