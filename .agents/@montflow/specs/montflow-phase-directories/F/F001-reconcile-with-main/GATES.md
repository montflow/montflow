# GATES

## Stage 0: Static

- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs test` passes after the merge
- [x] `bun run --cwd apps/workspace test` passes after the merge
- [x] `bun run mf:check` passes after the merge
- [x] every conflict resolution is recorded in MEMORY.md
