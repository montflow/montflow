# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli status --dir . --name spec-optimizations` prints the same panel as before the split
- [ ] `bun run --cwd packages/specs cli models --json --catalog fixtures/catalog.json` round-trips after the split
- [ ] `bun run --cwd packages/specs cli check --dir . --verbose` exits 0 with the same findings
- [ ] No source file in the CLI exceeds roughly 1,000 lines
