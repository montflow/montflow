# GATES

## Stage 0: Seam

- [ ] `@montflow/references` exports the read-only summary used by the panel
- [ ] the seam performs no network call and no mutation
- [ ] plugin-loader smoke still lists the package

## Stage 1: Documentation and checks

- [ ] workspace README documents the panel and its states
- [ ] one slash spelling is used across binary, slash, and keybind
- [ ] `bun run --cwd apps/workspace test`, `turbo test:tui`, and `bun run --cwd packages/references test` pass
