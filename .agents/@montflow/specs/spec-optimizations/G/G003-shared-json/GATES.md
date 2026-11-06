# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs test -- src/modules/sizing/tests` stays green
- [x] `bun run --cwd packages/specs test -- src/modules/catalogue/tests` stays green
- [x] A malformed config still renders the same code, field, expected, actual, fix, and order
