# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs cli sizing --dir ../.. --name spec-optimizations --task D099 --human` prints `size budget`, `contributes 0`, and `phase budget`
- [x] `bun run --cwd packages/specs cli models --json --provider alpha --catalog fixtures/catalog.json` emits a storable default or null
- [x] `bun run --cwd packages/specs cli which --dir ../.. --branch feat/s` fails instead of matching a spec
