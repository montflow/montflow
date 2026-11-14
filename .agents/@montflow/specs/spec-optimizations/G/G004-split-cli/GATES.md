# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs cli status --dir . --name spec-optimizations` prints the same panel as before the split
- [x] `bun run --cwd packages/specs cli models --json --catalog fixtures/catalog.json` round-trips after the split
- [x] `bun run --cwd packages/specs cli check --dir . --verbose` exits 0 with the same findings
- [x] No source file in the CLI exceeds roughly 1,000 lines
