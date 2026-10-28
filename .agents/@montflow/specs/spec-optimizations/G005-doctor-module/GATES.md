# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli author --dir . --request test` still renders the authoring prompt
- [ ] `bun run --cwd packages/specs cli doctor --check --dir .` reports the same payloads
- [ ] The module-import scan finds no `src/modules` import of `src/apps`
