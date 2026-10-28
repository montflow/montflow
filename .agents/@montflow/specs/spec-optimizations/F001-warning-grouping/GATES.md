# GATES

## Stage 0: Verification

- [ ] `bun run --cwd packages/specs test` passes
- [ ] `bun run --cwd packages/specs lint:check` passes
- [ ] `bun run --cwd packages/specs format:check` passes
- [ ] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [ ] `bun run mf:check:specs` reports the warning count in a short grouped summary
- [ ] `bun run --cwd packages/specs cli check --dir . --verbose --name montflow-ci-verification` expands the grouped warnings
- [ ] `bun run --cwd packages/specs cli check --dir . --strict --name montflow-spec-standard` still fails on promoted warnings
