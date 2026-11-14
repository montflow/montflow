# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs cli models --catalog fixtures/catalog.json` reports the fixture omission counts
- [x] `bun run --cwd packages/specs cli check --dir fixtures --catalog fixtures/catalog.json --name mock-ok` exits non-zero on the fixture mismatch
- [x] `bun run --cwd packages/specs cli check --dir . --name spec-optimizations` stays host-free and green
