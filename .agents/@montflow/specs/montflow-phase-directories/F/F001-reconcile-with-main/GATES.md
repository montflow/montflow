# GATES

## Stage 0: Static

- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs test` passes after the merge
- [ ] `bun run --cwd apps/workspace test` passes after the merge
- [ ] `bun run mf:check` passes after the merge
- [ ] every conflict resolution is recorded in MEMORY.md
