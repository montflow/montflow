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
