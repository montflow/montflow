# GATES

## Stage 0: Verification

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run mf:check:specs` reports the warning count in a short grouped summary
- [x] `bun run --cwd packages/specs cli check --dir ../.. --verbose --name montflow-ci-verification` expands the grouped warnings
- [x] `bun run --cwd packages/specs cli check --dir ../.. --strict --name montflow-spec-standard` still fails on promoted warnings
