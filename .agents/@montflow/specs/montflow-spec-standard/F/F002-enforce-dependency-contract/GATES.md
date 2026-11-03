# GATES

## Stage 1: Package checks

- [ ] `bun run --cwd packages/specs test -- src/modules/structure/tests/verify-spec-tree.test.ts`
- [ ] `bun run --cwd packages/specs test -- src/modules/task/tests/verify-task-file.test.ts`
- [ ] `bun run --cwd packages/specs ts:check`
- [ ] `bun run --cwd packages/specs lint:check`
- [ ] `bun run --cwd packages/specs format:check`

## Stage 2: Spec store

- [ ] `bun run --cwd packages/specs cli check --dir "$PWD" --name montflow-spec-standard` reports zero issues
- [ ] `bun run --cwd packages/specs cli check --dir "$PWD"` reports zero issues for every spec in the store
