# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli next --dir fixtures --name mock-bad` exits 1
- [ ] `bun run --cwd packages/specs cli next --dir . --name spec-optimizations` still exits 0 for a valid tree
- [ ] `bun run --cwd packages/specs cli models --verify --provider alpha --catalog fixtures/catalog.json --dir fixtures` prints `0 entries checked`
