# Memory

## Context

Phase E removes internal Pi-era names and guards the tree.

## Progress

- The retired prompts directory is now spelled once (`Prompts.LEGACY_STORE_SEGMENTS`); store, doctor, TUI, and tests read that constant. Only the constant and the workspace lazy-runtime mirror still contain the old name, both justified in the guard.

## Open Questions

- None.

## Handoff

- Keep behaviour identical; this phase is a rename and a guard.

## Deviations

- None.

## B002 retrofit evidence

- 2026-11-02: B002 verified this completed record against this MEMORY, its commits, and the diff.
- Store gate re-run at HEAD: `bun run ts:check`, `bun run lint:check`, `bun run fmt:check`, `bun run test`, and `bun run mf:check` all exit 0; results are quoted in `montflow-spec-standard/B/B002-retrofit-completed-records/MEMORY.md`.
Gate items: checked against the runs recorded here and at HEAD.
