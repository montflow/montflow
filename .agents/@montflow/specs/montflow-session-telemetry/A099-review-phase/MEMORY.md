# Memory

## Context

Phase A shipped the in-process NDJSON collector. Two independent review series
were run: the spec series (`montflow-session-telemetry`) and the
`effect-reviewer` series.

## Progress

- 2026-10-28: complete. Round 001 filed 9 general findings and 11 effect
  findings; the fixer addressed them and round 002 re-reviewed every carried
  finding. All phase A findings are `Resolved`; the single `Won't Fix`
  (multi-writer `repairTail`) is documented with its single-server rationale.
  Evidence: `packages/telemetry` tests, `ts:check`, `lint:check`,
  `format:check`; `mf-reviews verify` clean.

## Open Questions

- None.

## Handoff

- Phase B inherited the hardened collector. Its remaining surface review is
  blocked by the phase C surface replacement; see `B099-review-phase/MEMORY.md`.

## Deviations

- None.
