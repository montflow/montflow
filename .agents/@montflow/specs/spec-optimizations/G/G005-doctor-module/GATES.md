# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs cli author --dir . --request test` still renders the authoring prompt
- [x] `bun run --cwd packages/specs cli doctor --check --dir .` reports the same payloads
- [x] The module-import scan finds no `src/modules` import of `src/apps`
