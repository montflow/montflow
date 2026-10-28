# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli sizing --dir . --name spec-optimizations --task D099 --human` prints `size budget`, `contributes 0`, and `phase budget`
- [ ] `bun run --cwd packages/specs cli models --json --provider alpha --catalog fixtures/catalog.json` emits a storable default or null
- [ ] `bun run --cwd packages/specs cli which --dir . --branch feat/s` fails instead of matching a spec
