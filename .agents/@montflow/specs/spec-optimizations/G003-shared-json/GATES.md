# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs test -- src/modules/sizing/tests` stays green
- [ ] `bun run --cwd packages/specs test -- src/modules/catalogue/tests` stays green
- [ ] A malformed config still renders the same code, field, expected, actual, fix, and order
