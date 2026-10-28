# GATES

## Stage 0: Static

- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs fixtures:check` matches the documented verdicts
- [x] `bun run --cwd packages/specs test` passes
- [x] `mock-legacy` yielded one warning before D003 removed it
- [x] `mock-stray` yields the stray-file, directory, and deep-path findings
