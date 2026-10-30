# GATES

## Stage 0: Static

- [x] `bun run mf:check:skills` passes
- [x] `bun run mf:check:specs` passes
- [x] `bun run --cwd packages/specs format:check` passes

## Stage 1: Behaviour

- [x] both `montflow-create-pi-specs` copies are byte-identical
- [x] the skill's frontmatter version reads `3.0.0`
- [x] no document still shows a task directory at the spec root as the norm
