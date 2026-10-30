# Memory

## Context

- Phase A exploratory map reviewed by an independent reviewer over four rounds
  (`generic-reviewer`, series `references-plugin-a`, `.agents/@montflow/reviews/`).
- Inputs: `SPEC.md`, A001/A002/A003 `TASK.md` + `MEMORY.md`, and the repo.

## Progress

- Round 001: 12 findings (3 Major, 7 Minor, 2 Nit).
- Round 002: 9 resolved; 4 open (F1 coverage, F3 anchors, F12 ranges, F13 TASK
  citation); 1 new (F13 family).
- Round 003: F1/F3/F12/F13 resolved; 3 new (F14 pipe, F15 delimiter, F16
  ranges).
- Round 004: F14/F15/F16 resolved; no new findings. Series closed.
- Fixes landed in the spec and maps: store moved to `src/services/reference-store`;
  C007 deletes both skill dirs wholesale including `GATES.md`; D001 owns the
  retirement note; A002 gained the per-CLI scoped-invocation table; A001/A003
  counts, ranges, and anchors corrected; all three maps carry a phase-E
  revision note.

## Open Questions

- None blocking phase B. B001/B002/B003 inherit the maps; citations are
  text-anchored, not line-anchored.

## Handoff

- Phase A is complete. Next: B001 (registry/store contract), then B002 (git
  lifecycle) and B003 (CLI/plugin surfaces).

## Deviations

- A running concurrent session edited the same review series mid-pass; the
  final state is round 004 closed, verified by `mf-reviews verify` (5 files).
