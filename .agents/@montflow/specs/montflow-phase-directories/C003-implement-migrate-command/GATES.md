# GATES

## Stage 0: Static

- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs test` passes
- [x] a migrated synthetic tree verifies with zero issues and byte-identical file contents
- [x] `--dry-run` writes nothing and prints the plan
- [x] a mixed tree is refused with an actionable message
- [x] an already-migrated spec is a no-op
