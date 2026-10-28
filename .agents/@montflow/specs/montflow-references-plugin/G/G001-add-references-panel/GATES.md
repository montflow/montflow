# GATES

## Stage 0: Panel

- [ ] the grid shows a references panel beside skills, prompts, profiles, and specs
- [ ] each row carries slug, purpose, and one of synced/missing/dirty/foreign/ref-mismatch/invalid
- [ ] missing and empty stores render guidance, not a crash or a blank frame

## Stage 1: Interaction and tests

- [ ] search, windowing, and selection match the other panels
- [ ] `/references` or `/workspace` focuses the panel
- [ ] `bun run --cwd apps/workspace test` passes, including the new `.test.tsx`
- [ ] `turbo test:tui` passes
