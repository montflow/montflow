# GATES

## Stage 0: Static

- [x] `bun run --cwd packages/specs lint:check` passes
- [x] `bun run --cwd packages/specs format:check` passes
- [x] `bun run --cwd packages/specs ts:check` passes

## Stage 1: Behaviour

- [x] `bun run --cwd packages/specs test` passes
- [x] `bun run --cwd packages/specs fixtures:check` passes
- [x] an empty phase directory fails with its own field
- [x] a flat task directory at the root fails and names its target path (warning until D003)
- [x] a task id whose letters disagree with its phase directory fails
- [x] no file-only snapshot changes its previous verdict
- [x] scaffolded trees verify clean and `next` marks a nested gated task
