# GATES

## Stage 0: Static

- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs test` passes with no changed expectations in the structure suite
- [x] the store snapshot emits one directory entry per nested directory
- [x] a file-only snapshot and one listing its existing directories produce identical findings (empty dirs excluded)
