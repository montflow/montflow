# GATES

## Stage 1: Package checks

- [x] `bun run --cwd packages/specs test -- src/modules/structure/tests/verify-spec-tree.test.ts`
- [x] `bun run --cwd packages/specs test -- src/modules/task/tests/verify-task-file.test.ts`
- [x] `bun run --cwd packages/specs ts:check`
- [x] `bun run --cwd packages/specs lint:check`
- [x] `bun run --cwd packages/specs format:check`

## Stage 2: Spec store

- [x] `bun run --cwd packages/specs cli check --dir "$PWD" --name montflow-spec-standard` reports zero issues
- [x] `bun run --cwd packages/specs cli check --dir "$PWD"` reports zero issues for every spec in the store

## Stage 3: Package proof (mechanical)
command: bun run --cwd packages/specs test -- src/modules/structure/tests/verify-spec-tree.test.ts

- [x] the scoped package suite for this task passes
