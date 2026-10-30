# GATES

## Stage 0: Static

- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs test` passes
- [x] a flat task directory at the root is an error
- [x] `bun run mf:check:specs` reports zero issues and zero warnings
- [x] no finding changed severity except the deleted legacy warning
