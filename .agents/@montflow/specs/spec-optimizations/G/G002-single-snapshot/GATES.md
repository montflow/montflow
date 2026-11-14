# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs cli execute --dir fixtures --name mock-complete` still refuses with `spec.no-active-phase`
- [x] `bun run --cwd packages/specs cli next --dir . --name spec-optimizations` matches the pre-change baseline recorded in MEMORY
- [x] The counting-store test observes one snapshot for one execute call
