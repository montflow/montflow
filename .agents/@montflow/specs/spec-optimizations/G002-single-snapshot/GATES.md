# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run --cwd packages/specs cli execute --dir fixtures --name mock-complete` still refuses with `spec.no-active-phase`
- [ ] `bun run --cwd packages/specs cli next --dir . --name spec-optimizations` matches the pre-change baseline recorded in MEMORY
- [ ] The counting-store test observes one snapshot for one execute call
