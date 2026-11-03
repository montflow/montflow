# Memory

## Context

Finish the v2 surfaces after B001 lands the phase rail and C001/C005 add
`PHASE.md`, derived state, and the missing verbs. Every CLI command and the TUI
picker must read the phase tree, never the flat task-id prefix or a stored lock
list.

## Progress

- 2026-11-02: pending, planned as the CLI/TUI surface task.

## Open Questions

- Whether the TUI picker should show the derived state beside each spec name is
  left to this task; the requirement is only that it never offers a phase or task
  directory as a spec.

## Handoff

- C007 documents these surfaces after they land.

## Deviations

- None yet.
