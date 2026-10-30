# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli models --catalog fixtures/catalog.json` reports the fixture omission counts
- [ ] `bun run --cwd packages/specs cli check --dir fixtures --catalog fixtures/catalog.json --name mock-ok` exits non-zero on the fixture mismatch
- [ ] `bun run --cwd packages/specs cli check --dir . --name spec-optimizations` stays host-free and green
